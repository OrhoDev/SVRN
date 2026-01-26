import express, { Request, Response } from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Barretenberg, Fr } from '@aztec/bb.js'; 
import fs from 'fs';
import dotenv from 'dotenv';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU"); 

const keypairData = JSON.parse(fs.readFileSync('./relayer-keypair.json', 'utf-8'));
const relayerWallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
const idl = JSON.parse(fs.readFileSync('./idl.json', 'utf-8'));

const connection = new Connection(RPC_URL, "confirmed");
const walletWrapper = new anchor.Wallet(relayerWallet);
const provider = new anchor.AnchorProvider(connection, walletWrapper, { commitment: "confirmed" });
const program = new anchor.Program(idl, provider) as any;

const SNAPSHOT_DB: Record<string, any> = {};

console.log("🚀 SVRN Sovereign Relayer Online");

// --- ZK KERNEL (Using Async Barretenberg for stability) ---
let bb: any;
async function initZK() {
    console.log("   Initializing Barretenberg WASM (Async Mode)...");
    bb = await Barretenberg.new();
    console.log("   ✅ ZK Backend Ready");
}
initZK();

// --- NOIR-COMPATIBLE HASHING ---
/**
 * Based on the Aztec Forum & Noir Tutorial:
 * Noir's pedersen_hash([a, b]) = Barretenberg's pedersenHash([a, b], 0)
 * We use the Fr class to ensure every input has the .toBuffer() method.
 */
async function noirHash(input1: any, input2: any): Promise<Fr> {
    const toFr = (val: any) => {
        if (val instanceof Fr) return val;
        if (typeof val === 'bigint' || typeof val === 'number') return new Fr(BigInt(val));
        const clean = val.toString().replace('0x', '');
        return Fr.fromString(clean);
    };

    const f1 = toFr(input1);
    const f2 = toFr(input2);

    // Using the async Barretenberg instance
    // inputs: Fr[]
    // index: number (0 is default for Noir)
    const result = await bb.pedersenHash([f1, f2], 0);
    
    // Result is an Fr object or Buffer
    return (result instanceof Fr) ? result : Fr.fromBuffer(result);
}

function deriveSecret(pubkeyStr: string): bigint {
    const buffer = Buffer.from(pubkeyStr);
    let hash = 0n;
    const MOD = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
    for (const byte of buffer) {
        hash = (hash << 8n) + BigInt(byte);
        hash = hash % MOD;
    }
    return hash;
}

// ==========================================
// SNAPSHOT & MERKLE LOGIC
// ==========================================

app.post('/initialize-snapshot', async (req: Request, res: Response) => {
    try {
        if (!bb) return res.status(503).json({ error: "ZK Backend initializing..." });
        const { votingMint, proposalId } = req.body;
        const propKey = proposalId.toString(); 

        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 'svrn', method: 'getTokenAccounts',
                params: { mint: votingMint, limit: 1000, options: { showZeroBalance: false } }
            })
        });

        const data: any = await response.json();
        const accounts = data.result?.token_accounts || [];
        const voters = accounts.map((acc: any) => ({ owner: acc.owner, balance: Number(acc.amount) }))
            .filter((v: any) => v.balance > 0).slice(0, 8); 

        if (voters.length === 0) throw new Error("No token holders found.");

        const leavesFr: Fr[] = [];
        const voterMap: Record<string, any> = {};

        // 1. Build Leaves (Sequential to avoid WASM concurrency issues)
        for (let i = 0; i < voters.length; i++) {
            const v = voters[i];
            const secretVal = deriveSecret(v.owner);
            const leaf = await noirHash(secretVal, v.balance);
            leavesFr.push(leaf);

            voterMap[v.owner] = { 
                index: i, 
                balance: v.balance, 
                secret: "0x" + secretVal.toString(16), 
                leaf: leaf.toString() 
            };
        }

        // 2. Pad Tree
        const zeroLeaf = await noirHash(0, 0);
        while (leavesFr.length < 8) leavesFr.push(zeroLeaf);

        // 3. Build Tree
        const levels: string[][] = [leavesFr.map(f => f.toString())];
        let currentLevel: Fr[] = leavesFr;
        while (currentLevel.length > 1) {
            const nextLevel: Fr[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                nextLevel.push(await noirHash(currentLevel[i], currentLevel[i+1]));
            }
            currentLevel = nextLevel;
            levels.push(currentLevel.map(f => f.toString()));
        }

        const root = levels[levels.length - 1][0];
        SNAPSHOT_DB[propKey] = { root, voterMap, levels };

        console.log(`📸 [SNAPSHOT] Prop #${propKey} | Root: ${root.slice(0, 16)}...`);
        res.json({ success: true, root, count: voters.length });
    } catch (e: any) {
        console.error("SNAPSHOT_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/get-proof', (req: Request, res: Response) => {
    try {
        const { proposalId, userPubkey } = req.body;
        const snap = SNAPSHOT_DB[proposalId.toString()];
        if (!snap) return res.status(404).json({ error: "Snapshot not found" });
        const voter = snap.voterMap[userPubkey];
        if (!voter) return res.status(403).json({ error: "Ineligible" });

        const path: string[] = [];
        let currIdx = voter.index;
        for (let i = 0; i < 3; i++) {
            const siblingIdx = (currIdx % 2 === 0) ? currIdx + 1 : currIdx - 1;
            path.push(snap.levels[i][siblingIdx]);
            currIdx = Math.floor(currIdx / 2);
        }
        res.json({ success: true, proof: { ...voter, path, root: snap.root } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/relay-vote', async (req: Request, res: Response) => {
    try {
        const { nullifier, ciphertext, pubkey, nonce, proposalId } = req.body;
        const proposalBn = new anchor.BN(proposalId);
        const [proposalPda] = PublicKey.findProgramAddressSync([Buffer.from("proposal_v2"), proposalBn.toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
        const [nullifierPda] = PublicKey.findProgramAddressSync([Buffer.from("nullifier"), proposalPda.toBuffer(), Buffer.from(nullifier)], PROGRAM_ID);

        const tx = await program.methods.submitVote(
            [...Buffer.from(nullifier)], 
            Buffer.from(ciphertext), 
            [...Buffer.from(pubkey)], 
            new anchor.BN(Buffer.from(nonce), 'le')
        ).accounts({ 
            proposal: proposalPda, 
            nullifierAccount: nullifierPda, 
            relayer: relayerWallet.publicKey, 
            systemProgram: anchor.web3.SystemProgram.programId 
        }).signers([relayerWallet]).rpc();

        res.json({ success: true, tx });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`📡 Relayer listening on http://localhost:${PORT}`));