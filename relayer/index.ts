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
import {
    getArciumEnv,
    getCompDefAccOffset,
    getMXEAccAddress,
    getMempoolAccAddress,
    getCompDefAccAddress,
    getExecutingPoolAccAddress,
    getComputationAccAddress,
    getClusterAccAddress,
} from "@arcium-hq/client";

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
    console.warn("tally.json not found. Run 'nargo compile' and copy the json file.");
}

const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv"); 

// Load relayer keypair from environment variable or file
let relayerWallet: Keypair;
if (process.env.RELAYER_KEYPAIR) {
    // From environment variable (base58 encoded secret key)
    const secretKey = bs58.decode(process.env.RELAYER_KEYPAIR);
    relayerWallet = Keypair.fromSecretKey(secretKey);
} else {
    // From file (for local development)
    const keypairPath = process.env.RELAYER_KEYPAIR_PATH || './relayer-keypair.json';
    if (!fs.existsSync(keypairPath)) {
        throw new Error(`Relayer keypair not found at ${keypairPath}. Set RELAYER_KEYPAIR env var or create keypair file.`);
    }
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    relayerWallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
}
const idl = JSON.parse(fs.readFileSync('./idl.json', 'utf-8'));

const connection = new Connection(RPC_URL, "confirmed");
const walletWrapper = new anchor.Wallet(relayerWallet);
const provider = new anchor.AnchorProvider(connection, walletWrapper, { commitment: "confirmed" });
const program = new anchor.Program(idl, provider) as any;

// --- ARCIUM MPC SETUP ---
const ARCIUM_ID = new PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS");
let arciumProgram: any = null;
let arciumClusterOffset: number = 456; // Default, can be overridden by env
try {
    const arciumIdl = JSON.parse(fs.readFileSync('./arcium_idl.json', 'utf-8'));
    arciumProgram = new anchor.Program(arciumIdl, provider) as any;
    console.log("Arcium MPC Program loaded successfully");
    
    // Try to get cluster offset from env
    try {
        const arciumEnv = getArciumEnv();
        arciumClusterOffset = arciumEnv.arciumClusterOffset;
    } catch (e) {
        arciumClusterOffset = parseInt(process.env.ARCIUM_CLUSTER_OFFSET || '456');
    }
    console.log(`   Using Arcium cluster offset: ${arciumClusterOffset}`);
} catch (e) {
    console.warn("Arcium IDL not found - MPC decryption will be simulated");
}

const SNAPSHOT_DB: Record<string, any> = {};

// Vote storage for trusted relayer tallying
// Maps proposalId -> array of { voter, choice, weight }
const VOTE_STORAGE: Record<string, { voter: string, choice: number, weight: number }[]> = {};

console.log("Solvrn Relayer Online");

// --- ZK KERNEL ---
let bb: any;
async function initZK() {
    console.log("   Initializing Barretenberg WASM (Async Mode)...");
    bb = await Barretenberg.new();
    console.log("   ZK Backend Ready");
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==========================================
// PROPOSAL DISCOVERY (SDK Feature)
// ==========================================

// Get all proposals
app.get('/proposals', (req: Request, res: Response) => {
    try {
        const proposals = Object.keys(SNAPSHOT_DB).map(id => ({
            proposalId: Number(id),
            root: SNAPSHOT_DB[id].root,
            voterCount: Object.keys(SNAPSHOT_DB[id].voterMap || {}).length,
            metadata: SNAPSHOT_DB[id].metadata || {},
            createdAt: SNAPSHOT_DB[id].createdAt || null
        }));
        
        // Sort by proposalId descending (newest first)
        proposals.sort((a, b) => b.proposalId - a.proposalId);
        
        res.json({ success: true, proposals, count: proposals.length });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get active proposals (not executed)
app.get('/proposals/active', async (req: Request, res: Response) => {
    try {
        const proposals = [];
        
        for (const id of Object.keys(SNAPSHOT_DB)) {
            const snap = SNAPSHOT_DB[id];
            
            // Check on-chain status
            let isExecuted = false;
            try {
                const proposalBn = new anchor.BN(Number(id));
                const [proposalPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("svrn_v5"), proposalBn.toArrayLike(Buffer, "le", 8)], 
                    PROGRAM_ID
                );
                const proposalAccount = await program.account.proposal.fetch(proposalPda);
                isExecuted = proposalAccount.isExecuted;
            } catch (e) {
                // Proposal might not exist on-chain yet
            }
            
            if (!isExecuted) {
                proposals.push({
                    proposalId: Number(id),
                    root: snap.root,
                    voterCount: Object.keys(snap.voterMap || {}).length,
                    metadata: snap.metadata || {},
                    createdAt: snap.createdAt || null
                });
            }
        }
        
        proposals.sort((a, b) => b.proposalId - a.proposalId);
        res.json({ success: true, proposals, count: proposals.length });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get proposals by voting mint
app.get('/proposals/by-mint/:mint', (req: Request, res: Response) => {
    try {
        const mint = req.params.mint as string;
        const proposals = [];
        
        for (const id of Object.keys(SNAPSHOT_DB)) {
            const snap = SNAPSHOT_DB[id];
            if (snap.votingMint === mint) {
                proposals.push({
                    proposalId: Number(id),
                    root: snap.root,
                    voterCount: Object.keys(snap.voterMap || {}).length,
                    metadata: snap.metadata || {},
                    createdAt: snap.createdAt || null
                });
            }
        }
        
        proposals.sort((a, b) => b.proposalId - a.proposalId);
        res.json({ success: true, proposals, count: proposals.length });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Check eligibility for a wallet across all proposals
app.get('/proposals/eligible/:wallet', (req: Request, res: Response) => {
    try {
        const wallet = req.params.wallet as string;
        const eligible = [];
        
        for (const id of Object.keys(SNAPSHOT_DB)) {
            const snap = SNAPSHOT_DB[id];
            const voter = snap.voterMap?.[wallet];
            
            if (voter) {
                eligible.push({
                    proposalId: Number(id),
                    root: snap.root,
                    weight: voter.weight,
                    balance: voter.balance,
                    metadata: snap.metadata || {},
                    createdAt: snap.createdAt || null
                });
            }
        }
        
        eligible.sort((a, b) => b.proposalId - a.proposalId);
        res.json({ success: true, proposals: eligible, count: eligible.length });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Initialize ZK before starting server
async function startServer() {
    await initZK();
    
    app.listen(PORT, () => {
        console.log(`Solvrn Relayer listening on http://localhost:${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
    });
}

startServer();

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
        
        // UPDATED: Now destructuring metadata and creator only
        const { votingMint, proposalId, metadata, creator } = req.body;
        console.log(`[initialize-snapshot] Received: proposalId=${proposalId}, creator=${creator ? creator.slice(0,8) + '...' : 'UNDEFINED'}`);
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
        console.log(`[initialize-snapshot] RPC returned ${accounts.length} accounts`);
        let voters = accounts.map((acc: any) => ({ owner: acc.owner, balance: Number(acc.amount) }))
            .filter((v: any) => v.balance > 0).slice(0, 256);
        console.log(`[initialize-snapshot] After filtering: ${voters.length} voters`);

        // PRODUCTION MODE: Only add creator if they have tokens
        if (creator) {
            const creatorInVoters = voters.find((v: any) => v.owner === creator);
            if (!creatorInVoters) {
                console.log(`PRODUCTION MODE: Creator ${creator.slice(0,6)}... has no tokens. Not adding to voter list.`);
                // In production mode, we DON'T force-add creators without tokens
                // Uncomment the following lines for demo/testing mode:
                /*
                voters.unshift({
                    owner: creator,
                    balance: 1000000 // Default to 1 SOL for demo
                });
                console.log(`DEMO MODE: Force-added creator ${creator.slice(0,6)}... at beginning`);
                */
            } else {
                console.log(`PRODUCTION MODE: Creator ${creator.slice(0,6)}... already in voter list with ${creatorInVoters.balance} tokens`);
            }
        }
        console.log(`[initialize-snapshot] Final voter count: ${voters.length}`);

        const leavesFr: Fr[] = []; 
        const voterMap: Record<string, any> = {};

        console.log(`\n=== BUILDING MERKLE TREE DEBUG ===`);
        console.log(`Total voters before tree building: ${voters.length}`);
        for (let i = 0; i < Math.min(voters.length, 5); i++) {
            console.log(`  [${i}] ${voters[i].owner.slice(0,8)}... balance=${voters[i].balance}`);
        }
        if (voters.length > 5) console.log(`  ... and ${voters.length - 5} more`);

        console.log(`\n--- BUILDING QUADRATIC VOTING TREE (Prop #${propKey}) ---`);
        console.log(`Total voters before creator check: ${voters.length}`);

        for (let i = 0; i < voters.length; i++) {
            const v = voters[i];
            const secretVal = deriveSecret(v.owner);
            
            // Feature 1: Quadratic Weighting (Square Root)
            const weight = Math.floor(Math.sqrt(v.balance));
            
            console.log(`   [${i}] User: ${v.owner.slice(0,6)}... | Bal: ${v.balance} | Weight: ${weight}`);

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

        console.log(`Total voters processed: ${Object.keys(voterMap).length}`);
        console.log(`Creator ${creator?.slice(0,6)}... in voterMap: ${creator ? (voterMap[creator] ? 'YES' : 'NO') : 'N/A'}`);

        const zeroLeaf = await noirHash(0, 0);
        while (leavesFr.length < 256) leavesFr.push(zeroLeaf);

        console.log(`Building Merkle tree with ${leavesFr.length} leaves...`);

        const levels: string[][] = [leavesFr.map(f => f.toString())];
        let currentLevel: Fr[] = leavesFr;

        while (currentLevel.length > 1) {
            const nextLevelFr: Fr[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                // Handle odd number of nodes by duplicating the last one
                const left = currentLevel[i];
                const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i];
                const parent = await noirHash(left, right);
                nextLevelFr.push(parent);
            }
            currentLevel = nextLevelFr;
            levels.push(currentLevel.map(f => f.toString()));
        }

        const root = levels[levels.length - 1][0];
        console.log(`=== TREE BUILT ===`);
        console.log(`Final root: ${root}`);
        console.log(`Tree depth: ${levels.length}`);
        console.log(`=== END TREE DEBUG ===`);
        
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
// PRIVACY-PRESERVING PROPOSAL CREATION
// Relayer creates proposal on-chain (creator identity hidden)
// ==========================================
const CREATOR_DB: Record<string, { creator: string, createdAt: number }> = {};

app.post('/create-proposal', async (req: Request, res: Response) => {
    try {
        if (!bb) return res.status(503).json({ error: "ZK Backend initializing..." });
        
        const { votingMint, proposalId, metadata, creator, targetWallet, paymentSignature } = req.body;
        
        if (!votingMint || !proposalId || !creator) {
            return res.status(400).json({ success: false, error: "Missing required fields: votingMint, proposalId, creator" });
        }
        
        const propKey = proposalId.toString();
        console.log(`\n=== CREATE-PROPOSAL (Privacy Mode) ===`);
        console.log(`   Proposal ID: ${propKey}`);
        console.log(`   Creator: ${creator.slice(0, 8)}... (hidden on-chain)`);
        console.log(`   Voting Mint: ${votingMint.slice(0, 8)}...`);

        // FEE PAYMENT VERIFICATION (Optional - for production)
        // In production, verify creator sent SOL to relayer before creating proposal
        // For now, we'll add a check but make it optional for demo
        const FEE_AMOUNT_SOL = 0.01; // 0.01 SOL fee for proposal creation
        if (paymentSignature) {
            // Verify payment transaction exists and is from creator
            try {
                const paymentTx = await connection.getTransaction(paymentSignature, { commitment: 'confirmed' });
                if (!paymentTx) {
                    return res.status(402).json({ 
                        success: false, 
                        error: "Payment not found. Please send payment first.",
                        relayerAddress: relayerWallet.publicKey.toBase58(),
                        feeAmount: FEE_AMOUNT_SOL
                    });
                }
                // Check if payment is from creator to relayer
                const creatorPubkey = new PublicKey(creator);
                const paymentValid = paymentTx.transaction.message.accountKeys.some((key, idx) => {
                    return key.equals(creatorPubkey) && paymentTx.transaction.message.accountKeys.some((k, i) => 
                        k.equals(relayerWallet.publicKey) && i !== idx
                    );
                });
                if (!paymentValid) {
                    console.warn(`   Payment verification failed for ${paymentSignature}`);
                } else {
                    console.log(`   ✅ Payment verified: ${paymentSignature.slice(0, 16)}...`);
                }
            } catch (e: any) {
                console.warn(`   Payment verification error: ${e?.message || String(e)}`);
                // Continue anyway for demo mode
            }
        } else {
            console.log(`   ⚠️  No payment signature provided (demo mode - relayer pays)`);
            console.log(`   Production: Send ${FEE_AMOUNT_SOL} SOL to ${relayerWallet.publicKey.toBase58()} before creating proposal`);
        }

        // 1. Initialize snapshot (same logic as /initialize-snapshot)
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
        let voters = accounts.map((acc: any) => ({ owner: acc.owner, balance: Number(acc.amount) }))
            .filter((v: any) => v.balance > 0).slice(0, 256);

        // PRODUCTION MODE: Only add creator if they have tokens
        if (creator) {
            const creatorInVoters = voters.find((v: any) => v.owner === creator);
            if (!creatorInVoters) {
                console.log(`PRODUCTION MODE: Creator ${creator.slice(0,6)}... has no tokens. Not adding to voter list.`);
                // In production mode, we DON'T force-add creators without tokens
                // Uncomment the following lines for demo/testing mode:
                /*
                voters.unshift({
                    owner: creator,
                    balance: 1000000 // Default to 1 SOL for demo
                });
                console.log(`DEMO MODE: Force-added creator ${creator.slice(0,6)}... at beginning`);
                */
            } else {
                console.log(`PRODUCTION MODE: Creator ${creator.slice(0,6)}... already in voter list with ${creatorInVoters.balance} tokens`);
            }
        }

        if (voters.length === 0) {
            return res.status(400).json({ success: false, error: "No token holders found" });
        }

        // Build Merkle tree
        const leavesFr: Fr[] = []; 
        const voterMap: Record<string, any> = {};

        for (let i = 0; i < voters.length; i++) {
            const v = voters[i];
            const secretVal = deriveSecret(v.owner);
            const weight = Math.floor(Math.sqrt(v.balance));
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
        while (leavesFr.length < 256) leavesFr.push(zeroLeaf);

        const levels: string[][] = [leavesFr.map(f => f.toString())];
        let currentLevel: Fr[] = leavesFr;

        while (currentLevel.length > 1) {
            const nextLevelFr: Fr[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i];
                const parent = await noirHash(left, right);
                nextLevelFr.push(parent);
            }
            currentLevel = nextLevelFr;
            levels.push(currentLevel.map(f => f.toString()));
        }

        const root = levels[levels.length - 1][0];
        
        // Save snapshot
        SNAPSHOT_DB[propKey] = { root, voterMap, levels, metadata: metadata || {} };
        console.log(`   Snapshot built. Root: ${root.slice(0, 16)}...`);

        // 2. Create proposal on-chain (RELAYER signs, not creator)
        const proposalBn = new BN(proposalId);
        const [proposalPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("svrn_v5"), proposalBn.toArrayLike(Buffer, "le", 8)], 
            PROGRAM_ID
        );

        // Convert merkle root to bytes
        const rootHex = root.replace('0x', '').padStart(64, '0');
        const merkleRootBytes: number[] = [];
        for (let i = 0; i < 64; i += 2) {
            merkleRootBytes.push(parseInt(rootHex.substr(i, 2), 16));
        }

        const votingMintPubkey = new PublicKey(votingMint);
        const targetWalletPubkey = targetWallet ? new PublicKey(targetWallet) : relayerWallet.publicKey;

        // Calculate associated token account for proposal
        const [vault] = PublicKey.findProgramAddressSync(
            [
                proposalPda.toBuffer(), 
                TOKEN_PROGRAM_ID.toBuffer(),
                votingMintPubkey.toBuffer()
            ], 
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        console.log(`   Creating on-chain proposal...`);
        console.log(`   Authority (on-chain): ${relayerWallet.publicKey.toBase58().slice(0, 8)}... (relayer)`);
        console.log(`   Proposal Token Account: ${vault.toBase58().slice(0, 8)}...`);

        const tx = await program.methods.initializeProposal(
            proposalBn,
            merkleRootBytes,
            new BN(1000) // execution_amount
        ).accounts({
            proposal: proposalPda,
            proposalTokenAccount: vault, // Associated token account
            votingMint: votingMintPubkey,
            treasuryMint: votingMintPubkey,
            targetWallet: targetWalletPubkey,
            relayer: relayerWallet.publicKey, // Contract expects 'relayer' not 'authority'
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId
        }).signers([relayerWallet]).rpc();

        console.log(`   ✅ Proposal created on-chain: ${tx.slice(0, 16)}...`);

        // 3. Store creator mapping off-chain (for finalization later)
        CREATOR_DB[propKey] = { creator, createdAt: Date.now() };

        res.json({ 
            success: true, 
            tx, 
            proposalId: propKey,
            root,
            voterCount: voters.length,
            message: "Proposal created with privacy-preserving mode (creator hidden on-chain)"
        });

    } catch (e: any) {
        console.error("CREATE_PROPOSAL_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- PRODUCTION ENDPOINT: Add creator to existing voting tree ---
app.post('/add-creator', async (req: Request, res: Response) => {
    try {
        const { proposalId, creator } = req.body;
        const propKey = proposalId.toString();
        
        if (!SNAPSHOT_DB[propKey]) {
            return res.status(404).json({ success: false, error: "Proposal not found" });
        }
        
        const snapshot = SNAPSHOT_DB[propKey];
        const creatorInVoters = snapshot.voterMap[creator];
        
        if (creatorInVoters) {
            return res.json({ success: true, message: "Creator already in voting tree" });
        }
        
        // PRODUCTION MODE: Check actual token balance first
        console.log(`🔧 PRODUCTION: Checking token balance for creator ${creator.slice(0,6)}...`);
        
        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 'svrn', method: 'getTokenAccounts',
                params: { mint: snapshot.metadata?.votingMint || "So11111111111111111111111111111111111111112", 
                         limit: 1, options: { showZeroBalance: false },
                         account: creator }
            })
        });
        
        const data: any = await response.json();
        const accounts = data.result?.token_accounts || [];
        
        if (accounts.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: "Creator has no token balance. Cannot add to voting tree." 
            });
        }
        
        const balance = Number(accounts[0].amount);
        const weight = Math.floor(Math.sqrt(balance));
        
        console.log(`✅ PRODUCTION: Creator found with balance ${balance}, weight ${weight}`);
        
        const secretVal = deriveSecret(creator);
        const leaf = await noirHash(secretVal, weight);
        
        // Add to voterMap with REAL balance
        const creatorIndex = Object.keys(snapshot.voterMap).length;
        snapshot.voterMap[creator] = {
            index: creatorIndex,
            balance: balance,
            weight: weight,
            secret: "0x" + secretVal.toString(16).padStart(64, '0'),
            leaf: leaf.toString()
        };
        
        // REBUILD THE MERKLE TREE with the new leaf
        const voters = Object.values(snapshot.voterMap);
        const leavesFr: Fr[] = voters.map((v: any) => {
            const clean = v.leaf.toString().replace('0x', '');
            return Fr.fromString(clean);
        });
        
        // Pad to power of 2 if needed
        const zeroLeaf = await noirHash(0, 0);
        let targetSize = 1;
        while (targetSize < leavesFr.length) targetSize *= 2;
        while (leavesFr.length < targetSize) leavesFr.push(zeroLeaf);
        
        // Rebuild levels
        const levels: string[][] = [leavesFr.map(f => f.toString())];
        let currentLevel: Fr[] = leavesFr;
        
        while (currentLevel.length > 1) {
            const nextLevelFr: Fr[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i];
                const parent = await noirHash(left, right);
                nextLevelFr.push(parent);
            }
            currentLevel = nextLevelFr;
            levels.push(currentLevel.map(f => f.toString()));
        }
        
        // Update the snapshot with new tree
        const newRoot = levels[levels.length - 1][0];
        snapshot.root = newRoot;
        snapshot.levels = levels;
        
        console.log(`🔧 PRODUCTION: Rebuilt tree. New root: ${newRoot.slice(0, 16)}...`);
        res.json({ success: true, message: "Creator added with real token balance", root: newRoot, balance, weight });
        
    } catch (e: any) {
        console.error("ADD_CREATOR_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- DEMO ENDPOINT: Add creator with 1 token (for testing only) ---
app.post('/demo-add-creator', async (req: Request, res: Response) => {
    try {
        const { proposalId, creator } = req.body;
        const propKey = proposalId.toString();
        
        if (!SNAPSHOT_DB[propKey]) {
            return res.status(404).json({ success: false, error: "Proposal not found" });
        }
        
        const snapshot = SNAPSHOT_DB[propKey];
        const creatorInVoters = snapshot.voterMap[creator];
        
        if (creatorInVoters) {
            return res.json({ success: true, message: "Creator already in voting tree" });
        }
        
        console.log(`🔧 DEMO: Adding creator ${creator.slice(0,6)}... with 1 token for testing`);
        
        // Add creator with minimum balance (1 token) for voting rights
        const secretVal = deriveSecret(creator);
        const weight = 1; // sqrt(1) = 1
        const leaf = await noirHash(secretVal, weight);
        
        // Add to voterMap
        const creatorIndex = Object.keys(snapshot.voterMap).length;
        snapshot.voterMap[creator] = {
            index: creatorIndex,
            balance: 1,
            weight: weight,
            secret: "0x" + secretVal.toString(16).padStart(64, '0'),
            leaf: leaf.toString()
        };
        
        // REBUILD THE MERKLE TREE with the new leaf
        const voters = Object.values(snapshot.voterMap);
        const leavesFr: Fr[] = voters.map((v: any) => {
            const clean = v.leaf.toString().replace('0x', '');
            return Fr.fromString(clean);
        });
        
        // Pad to power of 2 if needed
        const zeroLeaf = await noirHash(0, 0);
        let targetSize = 1;
        while (targetSize < leavesFr.length) targetSize *= 2;
        while (leavesFr.length < targetSize) leavesFr.push(zeroLeaf);
        
        // Rebuild levels
        const levels: string[][] = [leavesFr.map(f => f.toString())];
        let currentLevel: Fr[] = leavesFr;
        
        while (currentLevel.length > 1) {
            const nextLevelFr: Fr[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i];
                const parent = await noirHash(left, right);
                nextLevelFr.push(parent);
            }
            currentLevel = nextLevelFr;
            levels.push(currentLevel.map(f => f.toString()));
        }
        
        // Update the snapshot with new tree
        const newRoot = levels[levels.length - 1][0];
        snapshot.root = newRoot;
        snapshot.levels = levels;
        
        console.log(`🔧 DEMO: Rebuilt tree. New root: ${newRoot.slice(0, 16)}...`);
        res.json({ success: true, message: "Creator added with 1 token (demo mode)", root: newRoot });
        
    } catch (e: any) {
        console.error("DEMO_ADD_CREATOR_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// 2. PROOF GENERATION (Voting)
// ==========================================

app.post('/get-proof', (req: Request, res: Response) => {
    console.log("=== GET-PROOF DEBUG ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("Available proposals in SNAPSHOT_DB:", Object.keys(SNAPSHOT_DB));
    
    try {
        const { proposalId, userPubkey } = req.body;
        const snap = SNAPSHOT_DB[proposalId.toString()];
        
        console.log(`Looking for proposal ${proposalId} in SNAPSHOT_DB...`);
        console.log(`Found snapshot:`, snap ? 'YES' : 'NO');
        
        if (!snap) {
            console.log("ERROR: Snapshot not found for proposal", proposalId);
            return res.status(404).json({ error: "Snapshot not found" });
        }
        
        console.log(`Snapshot root: ${snap.root}`);
        console.log(`Snapshot voter count: ${Object.keys(snap.voterMap || {}).length}`);
        
        const voter = snap.voterMap[userPubkey];
        if (!voter) {
            console.log("ERROR: Voter not found in snapshot", userPubkey);
            console.log("Available voters:", Object.keys(snap.voterMap));
            return res.status(403).json({ error: "Ineligible" });
        }

        console.log(`Voter found: index=${voter.index}, balance=${voter.balance}, weight=${voter.weight}`);

        const path: string[] = [];
        let currIdx = voter.index;
        for (let i = 0; i < 8; i++) {
            const siblingIdx = (currIdx % 2 === 0) ? currIdx + 1 : currIdx - 1;
            path.push(snap.levels[i][siblingIdx]);
            currIdx = Math.floor(currIdx / 2);
        }
        
        const proof = { ...voter, path, root: snap.root };
        console.log(`Proof generated - proposal=${proposalId} user=${userPubkey} index=${voter.index} root=${snap.root.slice(0,16)}...`);
        console.log(`Proof.path[0]: ${path[0].slice(0,16)}...`);
        console.log("=== GET-PROOF RESPONSE SENT ===");
        
        res.json({ success: true, proof });
    } catch (e: any) { 
        console.log("ERROR in get-proof:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

// ==========================================
// 3. VOTING (Solana Interaction)
// ==========================================

app.post('/relay-vote', async (req: Request, res: Response) => {
    try {
        console.log("RELAY-VOTE DEBUG: Received body:", JSON.stringify(req.body, null, 2));
        
        const { nullifier, ciphertext, pubkey, nonce, proposalId } = req.body;
        
        console.log("RELAY-VOTE DEBUG: Types:", {
            nullifier: typeof nullifier,
            ciphertext: typeof ciphertext,
            pubkey: typeof pubkey,
            nonce: typeof nonce,
            proposalId: typeof proposalId
        });
        
        const proposalBn = new anchor.BN(proposalId);
        // SYNCED SEED: svrn_v5
        const [proposalPda] = PublicKey.findProgramAddressSync([Buffer.from("svrn_v5"), proposalBn.toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
        const [nullifierPda] = PublicKey.findProgramAddressSync([Buffer.from("nullifier"), proposalPda.toBuffer(), Buffer.from(nullifier)], PROGRAM_ID);
        
        // Helpful debug prints for explorer verification
        try {
            const nullifierBuf = Buffer.from(nullifier);
            console.log(`Relay Vote - proposal=${proposalId}`);
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
            console.log(`Vote relayed. tx: ${tx}`);
            console.log(`   Explorer (devnet): https://explorer.solana.com/tx/${tx}?cluster=devnet`);
            console.log(`   Check nullifier account: https://explorer.solana.com/address/${nullifierPda.toBase58()}?cluster=devnet`);
        } catch (logErr) { console.warn('Could not print tx explorer link', logErr); }

        res.json({ success: true, tx });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// --- ARCIUM MPC HELPERS ---

// Poll for computation result (bypass SDK type issues)
async function waitForMPCResult(compPda: PublicKey, timeoutMs: number = 60000): Promise<Buffer | null> {
    const startTime = Date.now();
    process.stdout.write("   ⏳ Waiting for Arcium MPC");
    
    while (Date.now() - startTime < timeoutMs) {
        const account = await connection.getAccountInfo(compPda);
        
        // Arcium writes result to account data
        // If data exists and is larger than discriminator (8 bytes), we have a result
        if (account && account.data.length > 8) {
            console.log(" ✅");
            return account.data;
        }
        
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(" ❌ Timeout");
    return null;
}

// Find next available computation offset
async function findNextCompOffset(clusterOffset: number): Promise<any> {
    // Start from 5 to avoid broken offsets 0-3
    let id = 5;
    while (id < 1000) {
        const compOffset = new BN(id);
        const pda = getComputationAccAddress(clusterOffset, compOffset);
        const info = await connection.getAccountInfo(pda);
        if (!info) return compOffset;
        id++;
    }
    throw new Error("Too many computations pending");
}

// --- REAL VOTE DECRYPTION ---
async function decryptVotes(votes: any[]): Promise<{yesVotes: number, noVotes: number}> {
    if (votes.length === 0) return {yesVotes: 0, noVotes: 0};
    
    console.log(`\n🔐 Starting MPC decryption for ${votes.length} votes...`);
    
    // Check if Arcium is available
    if (!arciumProgram) {
        console.log("   ⚠️ Arcium not configured - using simulated decryption");
        return simulatedDecrypt(votes);
    }
    
    // Get Arcium account PDAs
    const clusterPda = getClusterAccAddress(arciumClusterOffset);
    const mxeAccount = getMXEAccAddress(ARCIUM_ID);
    const mempoolAccount = getMempoolAccAddress(arciumClusterOffset);
    const executingPool = getExecutingPoolAccAddress(arciumClusterOffset);
    const compDefAccount = getCompDefAccAddress(
        ARCIUM_ID,
        Buffer.from(getCompDefAccOffset("add_together")).readUInt32LE()
    );
    
    // Verify computation definition exists
    const compDefInfo = await connection.getAccountInfo(compDefAccount);
    if (!compDefInfo) {
        console.log("   ⚠️ Arcium computation definition not found - using simulated decryption");
        console.log("   → Run: cd svrn_engine && yarn run init-mxe");
        return simulatedDecrypt(votes);
    }
    
    console.log(`   ✅ Arcium MPC ready (cluster: ${arciumClusterOffset})`);
    
    let totalYesPower = 0;
    let noVoteCount = 0;
    
    // Find starting computation offset
    const startingOffset = await findNextCompOffset(arciumClusterOffset);
    console.log(`   📍 Starting computation offset: ${startingOffset.toString()}`);
    
    for (let i = 0; i < votes.length; i++) {
        const vote = votes[i];
        
        try {
            // Extract encrypted ballot data
            const ciphertext = Buffer.from(vote.account.ciphertext);
            const pubkey = Buffer.from(vote.account.pubkey);
            const nonce = vote.account.nonce;
            
            console.log(`\n   📄 Decrypting Ballot #${i + 1}/${votes.length}...`);
            
            // Use sequential offsets
            const compOffset = new BN(startingOffset.toNumber() + i);
            const compPda = getComputationAccAddress(arciumClusterOffset, compOffset);
            
            // Parse ciphertext into two 32-byte arrays (balance, choice)
            const ciphertextArray = Array.from(ciphertext);
            const ciphertext0 = new Array(32).fill(0);
            const ciphertext1 = new Array(32).fill(0);
            
            for (let j = 0; j < Math.min(32, ciphertextArray.length); j++) {
                ciphertext0[j] = ciphertextArray[j];
            }
            for (let j = 0; j < Math.min(32, ciphertextArray.length - 32); j++) {
                ciphertext1[j] = ciphertextArray[j + 32];
            }
            
            const pubkeyArray = Array.from(pubkey);
            const nonceBN = new BN(nonce.toString());
            
            // Submit to Arcium MPC
            console.log(`      > Submitting to Arcium MPC (offset: ${compOffset.toString()})...`);
            
            const tx = await arciumProgram.methods
                .addTogether(
                    compOffset,
                    ciphertext0,
                    ciphertext1,
                    pubkeyArray,
                    nonceBN
                )
                .accountsPartial({
                    payer: relayerWallet.publicKey,
                    computationAccount: compPda,
                    clusterAccount: clusterPda,
                    mxeAccount: mxeAccount,
                    mempoolAccount: mempoolAccount,
                    executingPool: executingPool,
                    compDefAccount: compDefAccount,
                })
                .signers([relayerWallet])
                .rpc();
            
            console.log(`      > ✅ Tx sent: ${tx.slice(0, 16)}...`);
            
            // Wait for MPC result
            const resultData = await waitForMPCResult(compPda, 60000);
            
            if (resultData) {
                // Read u64 at offset 8 (skip discriminator)
                const power = resultData.readBigUInt64LE(8);
                const powerNum = Number(power);
                
                if (powerNum > 0) {
                    console.log(`      > 🟢 YES vote (power: ${powerNum})`);
                    totalYesPower += powerNum;
                } else {
                    console.log(`      > 🔴 NO vote`);
                    noVoteCount++;
                }
            } else {
                console.log(`      > ⚠️ MPC timeout, counting as NO`);
                noVoteCount++;
            }
            
        } catch (e: any) {
            console.error(`      > ❌ MPC Error: ${e.message}`);
            // On error, fall back to counting as abstain/no
            noVoteCount++;
        }
    }
    
    console.log(`\n   ✅ MPC Decryption Complete!`);
    console.log(`      YES Power: ${totalYesPower}`);
    console.log(`      NO Votes: ${noVoteCount}`);
    
    return { yesVotes: totalYesPower, noVotes: noVoteCount };
}

// Fallback simulated decryption (when Arcium not available)
function simulatedDecrypt(votes: any[]): { yesVotes: number, noVotes: number } {
    console.log("   Using simulated decryption (Arcium not configured)");
    let yesVotes = 0, noVotes = 0;
    
    for (const vote of votes) {
        // Simulate: 60% yes, 40% no with weight 1
        if (Math.random() > 0.4) {
            yesVotes++;
        } else {
            noVotes++;
        }
    }
    
    console.log(`   Simulated: ${yesVotes} YES, ${noVotes} NO`);
    return { yesVotes, noVotes };
}

// Get current vote counts for a proposal
app.get('/vote-counts/:proposalId', async (req: Request, res: Response) => {
    try {
        const proposalId = parseInt(req.params.proposalId as string);
        
        console.log(`Getting vote counts for proposal ${proposalId}`);
        
        // Get all nullifier accounts (votes) for this proposal
        let proposalVotes = [];
        try {
            const allVotes = await program.account.nullifierAccount.all();
            proposalVotes = allVotes.filter((vote: any) => 
                vote.account.proposal.toNumber() === proposalId
            );
        } catch (e) {
            console.log("No votes found or error accessing nullifier accounts");
        }
        
        console.log(`Found ${proposalVotes.length} votes for proposal ${proposalId}`);
        
        // For demo purposes, if no votes exist, simulate some
        // In production, you'd decrypt and count actual votes
        let yesVotes = 0, noVotes = 0;
        
        if (proposalVotes.length === 0) {
            // Demo mode: simulate some votes for testing
            yesVotes = 6;
            noVotes = 4;
            console.log("Demo mode: Using simulated vote counts");
        } else {
            console.log("Real mode: Decrypting actual votes...");
            
            // Use real decryption
            const decrypted = await decryptVotes(proposalVotes);
            yesVotes = decrypted.yesVotes;
            noVotes = decrypted.noVotes;
        }
        
        res.json({
            success: true,
            yesVotes,
            noVotes,
            totalVotes: Math.max(proposalVotes.length, yesVotes + noVotes),
            quorumMet: Math.max(proposalVotes.length, yesVotes + noVotes) >= 10, // QUORUM_REQ
            isDemoMode: proposalVotes.length === 0,
            realVoteCount: proposalVotes.length,
            // IMPORTANT: yes/no breakdown is simulated until real Arcium MPC decryption is implemented
            breakdownSimulated: true,
            warning: proposalVotes.length > 0 ? "Vote decryption is simulated. Real decryption coming soon." : "No votes found. Using demo counts."
        });
        
    } catch (e: any) {
        console.error("VOTE_COUNT_ERROR:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 4. FEATURE 2: ZK TALLY PROOF (Finalization)
// ==========================================

app.post('/prove-tally', async (req: Request, res: Response) => {
    try {
        console.log("Generating ZK Tally Proof...");
        
        if (!tallyCircuit) throw new Error("Tally Circuit JSON not found.");
        
        // 1. Inputs required by tally_circuit/src/main.nr
        const { yesVotes, noVotes, threshold, quorum } = req.body;
        
        console.log(`   Inputs: yes=${yesVotes}, no=${noVotes}, threshold=${threshold}, quorum=${quorum}`);
        
        // 2. Setup Dedicated Backend for Tally Circuit
        const tallyBackend = new UltraHonkBackend(tallyCircuit.bytecode, bb);
        const noir = new Noir(tallyCircuit);
        
        // 3. Execute Circuit (Inputs must match main.nr EXACTLY)
        const inputs = {
            yes_votes: yesVotes.toString(),
            no_votes: noVotes.toString(),
            majority_threshold_percent: threshold.toString(),
            quorum_requirement: quorum.toString()
        };

        console.log("   Executing tally circuit...");
        const { witness } = await noir.execute(inputs);
        
        // 4. Generate Proof
        console.log("   Generating ZK proof...");
        const proof = await tallyBackend.generateProof(witness);
        const hexProof = Buffer.from(proof.proof).toString('hex');
        
        console.log(`   Tally Proof Generated! Length: ${hexProof.length} chars`);
        
        res.json({ 
            success: true, 
            proof: hexProof,
            msg: "Majority & Quorum verified via ZK"
        });

    } catch (e: any) {
        console.error("TALLY_PROOF_ERROR:", e);
        console.error("Stack:", e.stack);
        res.status(500).json({ 
            success: false, 
            error: e.message || "Unknown error occurred during tally proof generation" 
        });
    }
});

// Server started in startServer() function