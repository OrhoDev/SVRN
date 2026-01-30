import express, { Request, Response } from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Barretenberg, UltraHonkBackend, Fr } from '@aztec/bb.js'; 
import { Noir } from '@noir-lang/noir_js';
import fs from 'fs';
import path from 'path'; 
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from 'bn.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- LOAD TALLY CIRCUIT ---
const tallyCircuitPath = path.join(__dirname, 'tally.json');
let tallyCircuit: any;
try {
    tallyCircuit = JSON.parse(fs.readFileSync(tallyCircuitPath, 'utf-8'));
} catch (e) {
    console.warn("⚠️ tally.json not found. Run 'nargo compile' and copy the json file.");
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

// --- ZK KERNEL ---
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

// Helper function to get highest proposal ID from on-chain accounts
async function getHighestProposalId(): Promise<number> {
    try {
        // Get all program accounts (no filters to avoid RPC issues)
        const programAccounts = await connection.getProgramAccounts(PROGRAM_ID);
        
        let maxId = 0;
        for (const account of programAccounts) {
            try {
                // Check if this account data looks like a proposal account
                // Proposal accounts start with proposal_id (8 bytes)
                if (account.account.data.length >= 8) {
                    const proposalIdBytes = account.account.data.slice(0, 8);
                    const proposalId = new BN(proposalIdBytes, 'le').toNumber();
                    
                    // Sanity check: proposal ID should be reasonable
                    if (proposalId > 0 && proposalId < 1000000) {
                        if (proposalId > maxId) {
                            maxId = proposalId;
                        }
                    }
                }
            } catch (e) {
                // Skip accounts that don't match our expected structure
                continue;
            }
        }
        
        console.log(`Found highest on-chain proposal ID: ${maxId} from ${programAccounts.length} accounts`);
        return maxId;
    } catch (error) {
        console.warn('Error fetching on-chain proposal IDs:', error);
        return 0; // Default to 0 if we can't fetch
    }
}

// ==========================================
// 0. NEW: INFO ROUTES (Fixes SDK 404s)
// ==========================================

// Fixes: "Unexpected token <" when SDK calls getNextProposalId
app.get('/next-proposal-id', async (req: Request, res: Response) => {
    try {
        // Get highest proposal ID from on-chain accounts
        const highestOnChainId = await getHighestProposalId();
        
        // Also check in-memory database for any proposals not yet on-chain
        const memoryIds = Object.keys(SNAPSHOT_DB).map(Number).filter(n => !isNaN(n));
        const highestMemoryId = memoryIds.length > 0 ? Math.max(...memoryIds) : 0;
        
        // Use the higher of the two sources
        const highestId = Math.max(highestOnChainId, highestMemoryId);
        const nextId = highestId + 1;
        
        console.log(`Next proposal ID: ${nextId} (on-chain: ${highestOnChainId}, memory: ${highestMemoryId})`);
        res.json({ success: true, nextId });
    } catch (error) {
        console.error('Error getting next proposal ID:', error);
        // Fallback to memory-based logic
        const ids = Object.keys(SNAPSHOT_DB).map(Number).filter(n => !isNaN(n));
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 2005;
        res.json({ success: true, nextId });
    }
});

// Admin endpoint to reset proposal ID counter
app.post('/admin/reset-proposals', (req: Request, res: Response) => {
    // Clear the snapshot database to reset proposal IDs
    Object.keys(SNAPSHOT_DB).forEach(key => delete SNAPSHOT_DB[key]);
    console.log("🔄 Proposal database reset - all proposal IDs cleared");
    res.json({ success: true, message: "Proposal database reset successfully" });
});

// Fixes: SDK ability to fetch proposal details
app.get('/proposal/:id', (req: Request, res: Response) => {
    const proposalId = req.params.id as string; // Explicitly cast to string
    const snap = SNAPSHOT_DB[proposalId];
    
    if (!snap) {
        return res.status(404).json({ success: false, error: "Proposal not found" });
    }
    
    res.json({ success: true, proposal: snap });
});
// ==========================================
// 1. SNAPSHOT & MERKLE LOGIC (Quadratic)
// ==========================================

app.post('/initialize-snapshot', async (req: Request, res: Response) => {
    try {
        if (!bb) return res.status(503).json({ error: "ZK Backend initializing..." });
        
        // UPDATED: Now destructuring metadata to save it
        const { votingMint, proposalId, metadata } = req.body;
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

        console.log(`\n--- BUILDING QUADRATIC VOTING TREE (Prop #${propKey}) ---`);

        for (let i = 0; i < voters.length; i++) {
            const v = voters[i];
            const secretVal = deriveSecret(v.owner);
            
            // Feature 1: Quadratic Weighting (Square Root)
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
        
        // UPDATED: Now saving metadata into the DB
        SNAPSHOT_DB[propKey] = { root, voterMap, levels, metadata: metadata || {} };

        console.log(`📸 Snapshot Built. Root: ${root.slice(0, 16)}...`);
        res.json({ success: true, root, count: voters.length });
    } catch (e: any) {
        console.error("SNAPSHOT_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// 2. PROOF GENERATION (Voting)
// ==========================================

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
        const proof = { ...voter, path, root: snap.root };
        console.log(`🔍 Proof requested - proposal=${proposalId} user=${userPubkey} index=${voter.index} root=${snap.root.slice(0,16)}...`);
        console.log(`       Proof.path: [${path.map(p=>p.slice(0,8)).join(', ')}]`);
        res.json({ success: true, proof });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 3. VOTING (Solana Interaction)
// ==========================================

app.post('/relay-vote', async (req: Request, res: Response) => {
    try {
        const { nullifier, ciphertext, pubkey, nonce, proposalId } = req.body;
        const proposalBn = new anchor.BN(proposalId);
        const [proposalPda] = PublicKey.findProgramAddressSync([Buffer.from("svrn_prop"), proposalBn.toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
        const [nullifierPda] = PublicKey.findProgramAddressSync([Buffer.from("nullifier"), proposalPda.toBuffer(), Buffer.from(nullifier)], PROGRAM_ID);

        // Helpful debug prints for explorer verification
        try {
            const nullifierBuf = Buffer.from(nullifier);
            console.log(`🔐 Relay Vote - proposal=${proposalId}`);
            console.log(`   proposalPda: ${proposalPda.toBase58()}`);
            console.log(`   nullifierPda: ${nullifierPda.toBase58()}`);
            console.log(`   nullifier (hex): ${nullifierBuf.toString('hex').slice(0,64)}...`);
            console.log(`   nullifier (bs58): ${bs58.encode(nullifierBuf)}`);
            console.log(`   ciphertext length: ${Buffer.from(ciphertext).length} bytes`);
        } catch (logErr) {
            console.warn('Could not print debug info for nullifier/ciphertext', logErr);
        }

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

        // Print the returned signature + explorer link to make verification trivial
        try {
            console.log(`✅ Vote relayed. tx: ${tx}`);
            console.log(`   Explorer (devnet): https://explorer.solana.com/tx/${tx}?cluster=devnet`);
            console.log(`   Check nullifier account: https://explorer.solana.com/address/${nullifierPda.toBase58()}?cluster=devnet`);
        } catch (logErr) { console.warn('Could not print tx explorer link', logErr); }

        res.json({ success: true, tx });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 4. FEATURE 2: ZK TALLY PROOF (Finalization)
// ==========================================

app.post('/prove-tally', async (req: Request, res: Response) => {
    try {
        console.log("⚖️  Generating ZK Tally Proof...");
        
        if (!tallyCircuit) throw new Error("Tally Circuit JSON not found.");
        
        // 1. Inputs required by tally_circuit/src/main.nr
        const { yesVotes, noVotes, threshold, quorum } = req.body;
        
        // 2. Setup Dedicated Backend for Tally Circuit
        const tallyBackend = new UltraHonkBackend(tallyCircuit.bytecode);
        const noir = new Noir(tallyCircuit);
        
        // 3. Execute Circuit (Inputs must match main.nr EXACTLY)
        const inputs = {
            yes_votes: yesVotes,
            no_votes: noVotes,
            majority_threshold_percent: threshold,
            quorum_requirement: quorum
        };

        const { witness } = await noir.execute(inputs);
        
        // 4. Generate Proof
        const proof = await tallyBackend.generateProof(witness);
        const hexProof = Buffer.from(proof.proof).toString('hex');
        
        console.log(`   ✅ Tally Proof Generated! Length: ${hexProof.length} chars`);
        
        res.json({ 
            success: true, 
            proof: hexProof,
            msg: "Majority & Quorum verified via ZK"
        });

    } catch (e: any) {
        console.error("TALLY_PROOF_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, () => console.log(`📡 Relayer listening on http://localhost:${PORT}`));