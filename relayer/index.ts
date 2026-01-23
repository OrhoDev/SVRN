import express from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const PORT = 3000;
// Support Helius RPC via environment variable, fallback to public devnet
const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
// ⚠️ Update this with your actual Program ID from the Backend
const PROGRAM_ID = new PublicKey("4Yg7QBY94QFH48C9z3114SidMKHqjT2xVMTFnM6fCo9Q"); 

// Load Relayer Wallet
const keypairData = JSON.parse(fs.readFileSync('./relayer-keypair.json', 'utf-8'));
const relayerWallet = Keypair.fromSecretKey(new Uint8Array(keypairData));

// Load IDL
const idl = JSON.parse(fs.readFileSync('./idl.json', 'utf-8'));

// Setup Anchor
const connection = new Connection(RPC_URL, "confirmed");
const walletWrapper = new anchor.Wallet(relayerWallet);
const provider = new anchor.AnchorProvider(connection, walletWrapper, { commitment: "confirmed" });
const program = new anchor.Program(idl, provider);

console.log("🚀 SolVote Relayer Started");
console.log("   Address:", relayerWallet.publicKey.toBase58());
console.log("   Target Program:", PROGRAM_ID.toBase58());

// --- THE ENDPOINT ---
app.post('/relay-vote', async (req, res) => {
    try {
        console.log("\n📥 Received Vote Request...");
        
        const { 
            proof,          // Array<number> (The ZK Proof)
            nullifier,      // Array<number> (The ZK Nullifier)
            ciphertext,     // Array<number> (Arcium Encrypted Choice)
            pubkey,         // Array<number> (Ephemeral x25519 public key)
            nonce,          // Array<number> (Encryption nonce, 16 bytes)
            proposalId      // Number (ID)
        } = req.body;

        // 1. Reconstruct Data types for Anchor
        // Convert Arrays back to Buffers/BNs
        const proofBuf = Buffer.from(proof);
        const nullifierBuf = Buffer.from(nullifier);
        const ciphertextBuf = Buffer.from(ciphertext);
        const pubkeyBuf = Buffer.from(pubkey);
        // Convert nonce array (16 bytes) to u128 BN
        const nonceBuf = Buffer.from(nonce);
        const nonceBN = new anchor.BN(nonceBuf, 'le');
        const proposalBn = new anchor.BN(proposalId);

        console.log(`   - Nullifier: ${nullifierBuf.toString('hex').slice(0, 10)}...`);
        console.log(`   - Proof Len: ${proofBuf.length} bytes`);

        // 2. Derive PDAs (Server-side calculation for safety)
        const [proposalPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("proposal"), proposalBn.toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        const [nullifierPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("nullifier"), proposalPda.toBuffer(), nullifierBuf],
            program.programId
        );

        // 3. Construct Transaction
        // NOTE: 'relayer' is the signer here. The user is NOT involved.
        // ⚠️ WORKAROUND: Use .instruction() to bypass Anchor's account validation
        // This prevents deserialization errors when the on-chain account structure
        // doesn't match the IDL (e.g., old proposals without voting_mint)
        const instruction = await program.methods
            .submitVote(
                Array.from(nullifierBuf), 
                ciphertextBuf,
                Array.from(pubkeyBuf),
                nonceBN
            )
            .accounts({
                proposal: proposalPda,
                nullifierAccount: nullifierPda,
                relayer: relayerWallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .instruction();

        // Build transaction manually to bypass account validation
        const transaction = new anchor.web3.Transaction().add(instruction);
        const latestBlockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = latestBlockhash.blockhash;
        transaction.feePayer = relayerWallet.publicKey;
        
        // Sign and send
        transaction.sign(relayerWallet);
        const tx = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3,
        });
        
        // Wait for confirmation
        await connection.confirmTransaction(tx, "confirmed");

        console.log("✅ Transaction Relayed:", tx);
        
        res.json({ 
            success: true, 
            tx: tx,
            explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`
        });

    } catch (error: any) {
        console.error("❌ Relay Error:", error.message);
        
        // Handle "Account already exists" (Double Vote attempt)
        if (error.message.includes("already in use")) {
            res.status(400).json({ success: false, error: "Double Vote Detected (Nullifier Used)" });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

app.listen(PORT, () => {
    console.log(`📡 Relayer listening on http://localhost:${PORT}`);
});