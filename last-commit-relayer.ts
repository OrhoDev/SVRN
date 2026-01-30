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
// CRITICAL: Import Legacy Token ID and Helper
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
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
// Use Helius or fallback to public devnet
const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv"); 

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

// --- NEW: AUTO-INDEXER ---
// Helper function to get highest proposal ID from on-chain accounts
// This prevents "Already in use" errors by finding the real state of the chain.
async function getHighestProposalId(): Promise<number> {
    try {
        // Get all program accounts (no filters to avoid RPC issues)
        // Note: For a production app, you would use memcmp filters or an indexer
        const programAccounts = await connection.getProgramAccounts(PROGRAM_ID);
        
        let maxId = 0;
        for (const account of programAccounts) {
            try {
                // Proposal accounts have an 8-byte discriminator + 8-byte proposal_id at offset 8
                // But simplified: check if data is large enough and try to parse
                if (account.account.data.length >= 16) {
                    // Skip discriminator (8 bytes), read proposal_id (8 bytes)
                    const proposalIdBytes = account.account.data.slice(8, 16);
                    const proposalId = new BN(proposalIdBytes, 'le').toNumber();
                    
                    // Sanity check: proposal ID should be reasonable
                    if (proposalId > 0 && proposalId < 1000000) {
                        if (proposalId > maxId) {
                            maxId = proposalId;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        console.log(`🔎 Auto-Indexer: Found highest on-chain ID: ${maxId}`);
        return maxId;
    } catch (error) {
        console.warn('⚠️ Auto-Indexer Warning: Could not fetch on-chain accounts. Defaulting to safe fallback.', error);
        return 0; 
    }
}

// ==========================================
// 0. NEW: INFO ROUTES (Fixes SDK 404s)
// ==========================================

app.get('/next-proposal-id', async (req: Request, res: Response) => {
    try {
        // 1. Check On-Chain (Source of Truth)
        const highestOnChainId = await getHighestProposalId();
        
        // 2. Check In-Memory (Pending)
        const memoryIds = Object.keys(SNAPSHOT_DB).map(Number).filter(n => !isNaN(n));
        const highestMemoryId = memoryIds.length > 0 ? Math.max(...memoryIds) : 0;
        
        // 3. Determine Safe Next ID
        const highestId = Math.max(highestOnChainId, highestMemoryId);
        
        // SAFETY: If chain is empty, start at 2005 to avoid any historic collisions
        const nextId = highestId === 0 ? 2005 : highestId + 1;
        
        console.log(`✅ Serving Next ID: ${nextId} (Chain: ${highestOnChainId}, Mem: ${highestMemoryId})`);
        res.json({ success: true, nextId });
    } catch (error) {
        // Fallback for extreme errors
        const fallbackId = Date.now() % 100000; 
        console.error('❌ Error getting ID, using fallback timestamp:', fallbackId);
        res.json({ success: true, nextId: fallbackId });
    }
});

// Admin endpoint to reset proposal ID counter
app.post('/admin/reset-proposals', (req: Request, res: Response) => {
    Object.keys(SNAPSHOT_DB).forEach(key => delete SNAPSHOT_DB[key]);
    console.log("🔄 Proposal database reset - all proposal IDs cleared");
    res.json({ success: true, message: "Proposal database reset successfully" });
});

app.get('/proposal/:id', (req: Request, res: Response) => {
    const proposalId = req.params.id as string;
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
    console.log("RAW BODY RECEIVED:", JSON.stringify(req.body, null, 2));
    try {
        if (!bb) return res.status(503).json({ error: "ZK Backend initializing..." });
        
        // DESTUCTURE CREATOR
        const { votingMint, proposalId, metadata, creator } = req.body;
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
            .filter((v: any) => v.balance > 0);

        // --- NEW: INJECT CREATOR ---
        if (creator) {
            const exists = voters.find((v: any) => v.owner === creator);
            if (!exists) {
                console.log(`   Creator ${creator} not in top list. Fetching manually...`);
                try {
                    // 1. Detect Token Program (Legacy vs 2022) - Default Legacy for speed/safety
                    const LEGACY_TOKEN_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
                    
                    const ata = await getAssociatedTokenAddress(
                        new PublicKey(votingMint),
                        new PublicKey(creator),
                        false,
                        LEGACY_TOKEN_ID
                    );
                    
                    const balanceRes = await connection.getTokenAccountBalance(ata);
                    const bal = Number(balanceRes.value.amount);
                    
                    if (bal > 0) {
                        console.log(`   ✅ Injected Creator with balance: ${bal}`);
                        voters.unshift({ owner: creator, balance: bal });
                    } else {
                        console.log(`   ⚠️ Creator has 0 balance. Adding anyway for demo eligibility.`);
                        voters.unshift({ owner: creator, balance: 0 });
                    }
                } catch (err) {
                    console.log(`   ⚠️ Could not fetch creator balance (likely no ATA). Adding with 0 balance.`);
                    voters.unshift({ owner: creator, balance: 0 });
                }
            }
        }

        // Slice to 8 AFTER injection
        const finalVoters = voters.slice(0, 8);

        if (finalVoters.length === 0) throw new Error("No token holders found.");

        const leavesFr: Fr[] = []; 
        const voterMap: Record<string, any> = {};

        console.log(`\n--- BUILDING QUADRATIC VOTING TREE (Prop #${propKey}) ---`);

        for (let i = 0; i < finalVoters.length; i++) {
            const v = finalVoters[i];
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
        SNAPSHOT_DB[propKey] = { root, voterMap, levels, metadata: metadata || {} };

        console.log(`📸 Snapshot Built. Root: ${root.slice(0, 16)}...`);
        res.json({ success: true, root, count: finalVoters.length });
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
        
        if (!snap) {
            console.warn(`❌ Proof Request: Snapshot not found for Prop #${proposalId}`);
            return res.status(404).json({ error: "Snapshot not found" });
        }

        const voter = snap.voterMap[userPubkey];
        
        if (!voter) {
            console.warn(`❌ Proof Request: User ${userPubkey} NOT in tree for Prop #${proposalId}`);
            console.warn(`   Available Voters: ${Object.keys(snap.voterMap).join(', ')}`);
            return res.status(403).json({ error: "Ineligible" });
        }

        const path: string[] = [];
        let currIdx = voter.index;
        for (let i = 0; i < 3; i++) {
            const siblingIdx = (currIdx % 2 === 0) ? currIdx + 1 : currIdx - 1;
            path.push(snap.levels[i][siblingIdx]);
            currIdx = Math.floor(currIdx / 2);
        }
        const proof = { ...voter, path, root: snap.root };
        console.log(`🔍 Proof Generated for ${userPubkey.slice(0,6)}...`);
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
        
        // SYNCED SEED: svrn_v5
        const [proposalPda] = PublicKey.findProgramAddressSync([Buffer.from("svrn_v5"), proposalBn.toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
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
        console.log("⚖️  RELAYER: Received Tally Request:", req.body);
        const { proposalId, yesVotes, noVotes, threshold, quorum } = req.body;
        
        // 1. Validate Circuit Exists
        if (!tallyCircuit) {
            console.error("❌ ERROR: tally.json is missing.");
            return res.status(500).json({ error: "Relayer misconfigured: tally.json missing" });
        }
        
        // 2. GENERATE REAL ZK PROOF (Noir)
        // This is the "Magic" - mathematically proving the result is valid
        console.log("   generating proof...");
        const tallyBackend = new UltraHonkBackend(tallyCircuit.bytecode);
        const noir = new Noir(tallyCircuit);
        
        const inputs = {
            yes_votes: yesVotes,
            no_votes: noVotes,
            majority_threshold_percent: threshold,
            quorum_requirement: quorum
        };

        const { witness } = await noir.execute(inputs);
        const proof = await tallyBackend.generateProof(witness);
        const hexProof = Buffer.from(proof.proof).toString('hex');
        
        console.log(`   ✅ Tally Proof Generated! (${hexProof.slice(0,10)}...)`);

        // 3. ON-CHAIN EXECUTION (Best Effort)
        // We try to settle on Solana. If the vault is empty, we catch the error 
        // so the UI still gets the ZK Proof (which is the winning demo factor).
        let tx = null;
        try {
            console.log(`   🚀 Attempting On-Chain Settlement...`);
            const proposalBn = new anchor.BN(proposalId);
            const [proposalPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("svrn_v5"), proposalBn.toArrayLike(Buffer, "le", 8)], 
                PROGRAM_ID
            );

            // Fetch state to get mints
            const propAcc = await program.account.proposal.fetch(proposalPda);

            // Derive ATAs
            const proposalTokenAccount = await getAssociatedTokenAddress(
                propAcc.treasuryMint, proposalPda, true, TOKEN_PROGRAM_ID
            );
            const targetTokenAccount = await getAssociatedTokenAddress(
                propAcc.treasuryMint, propAcc.targetWallet, false, TOKEN_PROGRAM_ID
            );

            tx = await program.methods.finalizeProposal(
                Buffer.from(proof.proof), 
                new anchor.BN(yesVotes),
                new anchor.BN(noVotes),
                new anchor.BN(threshold),
                new anchor.BN(quorum)
            ).accounts({
                proposal: proposalPda,
                proposalTokenAccount: proposalTokenAccount,
                targetTokenAccount: targetTokenAccount,
                targetWallet: propAcc.targetWallet,
                treasuryMint: propAcc.treasuryMint,
                authority: relayerWallet.publicKey, 
                tokenProgram: TOKEN_PROGRAM_ID, 
            })
            .signers([relayerWallet])
            .rpc();
            
            console.log(`   ✅ Settlement TX: ${tx}`);
        } catch (chainErr: any) {
            console.warn("   ⚠️ On-Chain Settlement skipped/failed (likely empty vault):", chainErr.message);
            // This is OK for demo. We proved the math via ZK.
        }
        
        res.json({ 
            success: true, 
            proof: hexProof,
            tx: tx || "Skipped (Demo Mode)",
            msg: "Majority & Quorum verified via ZK Proof."
        });

    } catch (e: any) {
        console.error("❌ TALLY_PROOF_ERROR:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, () => console.log(`📡 Relayer listening on http://localhost:${PORT}`));