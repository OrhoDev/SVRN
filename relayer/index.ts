import express, { Request, Response } from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Barretenberg, UltraHonkBackend, Fr } from '@aztec/bb.js'; // ✅ Import UltraHonkBackend
import { Noir } from '@noir-lang/noir_js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- LOAD CIRCUITS ---
const tallyCircuitPath = path.join(__dirname, 'tally.json');
let tallyCircuit: any;
try {
    tallyCircuit = JSON.parse(fs.readFileSync(tallyCircuitPath, 'utf-8'));
} catch (e) {
    console.warn("⚠️ tally.json not found. Feature #2 will fail.");
}

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

// --- ZK KERNEL (Global instance for hashing) ---
let bb: any;
async function initZK() {
    console.log("   Initializing Barretenberg WASM (Async Mode)...");
    bb = await Barretenberg.new();
    console.log("   ✅ ZK Backend Ready");
}
initZK();

// --- NOIR-COMPATIBLE HASHING ---
async function noirHash(input1: any, input2: any): Promise<Fr> {
    const toFr = (val: any) => {
        if (val instanceof Fr) return val;
        if (typeof val === 'bigint' || typeof val === 'number') return new Fr(BigInt(val));
        const clean = val.toString().replace('0x', '');
        return Fr.fromString(clean);
    };

    const f1 = toFr(input1);
    const f2 = toFr(input2);

    const result = await bb.pedersenHash([f1, f2], 0);
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

        console.log(`\n--- BUILDING QUADRATIC VOTING TREE ---`);

        for (let i = 0; i < voters.length; i++) {
            const v = voters[i];
            const secretVal = deriveSecret(v.owner);
            
            // Feature 1: Quadratic Weighting
            const weight = Math.floor(Math.sqrt(v.balance));
            
            console.log(`   User: ${v.owner.slice(0,6)}... | Bal: ${v.balance} | Weight: ${weight}`);

            const leaf = await noirHash(secretVal, weight);
            leavesFr.push(leaf);

            voterMap[v.owner] = { 
                index: i, 
                balance: v.balance, 
                weight: weight,
                secret: "0x" + secretVal.toString(16), 
                leaf: leaf.toString() 
            };
        }

        const zeroLeaf = await noirHash(0, 0);
        while (leavesFr.length < 8) leavesFr.push(zeroLeaf);

        const levels: string[][] = [leavesFr.map(f => f.toString())];
        let currentLevel: Fr[] = leavesFr;

        while (currentLevel.length > 1) {
            const nextLevelFr: Fr[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const parent = await noirHash(currentLevel[i], currentLevel[i+1]);
                nextLevelFr.push(parent);
            }
            currentLevel = nextLevelFr;
            levels.push(currentLevel.map(f => f.toString()));
        }

        const root = levels[levels.length - 1][0];
        SNAPSHOT_DB[propKey] = { root, voterMap, levels };

        console.log(`📸 [SNAPSHOT] Prop #${propKey} | QV Root: ${root.slice(0, 16)}...`);
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

// --- FEATURE 2: ZK TALLY PROOF ENDPOINT ---
app.post('/prove-tally', async (req: Request, res: Response) => {
    try {
        console.log("⚖️  Generating ZK Tally Proof...");
        const { yesVotes, noVotes, threshold } = req.body;
        
        if (!tallyCircuit) throw new Error("Tally Circuit JSON not found.");

        // 1. Instantiate the Backend SPECIFICALLY for this circuit
        // As per docs: New Backend per circuit
        const tallyBackend = new UltraHonkBackend(tallyCircuit.bytecode);
        const noir = new Noir(tallyCircuit);
        
        // 2. Execute Circuit (Generate Witness)
        const inputs = {
            yes_votes: yesVotes,
            no_votes: noVotes,
            threshold_percent: threshold
        };

        const { witness } = await noir.execute(inputs);
        
        // 3. Generate Proof using the specialized backend
        const proof = await tallyBackend.generateProof(witness);

        const hexProof = Buffer.from(proof.proof).toString('hex');
        console.log(`   ✅ Tally Proof Generated: ${hexProof.slice(0, 16)}...`);
        
        res.json({ 
            success: true, 
            proof: hexProof,
            msg: "Majority integrity verified via ZK"
        });

    } catch (e: any) {
        console.error("TALLY_PROOF_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, () => console.log(`📡 Relayer listening on http://localhost:${PORT}`));