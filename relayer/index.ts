import express from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';
import dotenv from 'dotenv';
import { Buffer } from 'buffer'; // Good practice to import explicit Buffer

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const PORT = 3000;
const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";

// ⚠️ FIX 1: UPDATE TO YOUR NEW DEPLOYED PROGRAM ID (From contracts/target/deploy/solvote_chain-keypair.json or lib.rs)
// Check your App.jsx or lib.rs for the one starting with "AZes..."
const PROGRAM_ID = new PublicKey("Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU"); 

// Load Relayer Wallet
const keypairData = JSON.parse(fs.readFileSync('./relayer-keypair.json', 'utf-8'));
const relayerWallet = Keypair.fromSecretKey(new Uint8Array(keypairData));

// ⚠️ REMINDER: Ensure this is the NEW idl.json from `contracts/target/idl/`
const idl = JSON.parse(fs.readFileSync('./idl.json', 'utf-8'));

// Setup Anchor
const connection = new Connection(RPC_URL, "confirmed");
const walletWrapper = new anchor.Wallet(relayerWallet);
const provider = new anchor.AnchorProvider(connection, walletWrapper, { commitment: "confirmed" });
const program = new anchor.Program(idl, provider);

console.log("🚀 SolVote Relayer Started");
console.log("   Address:", relayerWallet.publicKey.toBase58());
console.log("   Target Program:", PROGRAM_ID.toBase58());

app.post('/relay-vote', async (req, res) => {
    try {
        console.log("\n📥 Received Vote Request...");
        
        const { 
            proof,          
            nullifier,      
            ciphertext,     
            pubkey,         
            nonce,          
            proposalId      
        } = req.body;

        // 1. Reconstruct Data types
        const proofBuf = Buffer.from(proof);
        const nullifierBuf = Buffer.from(nullifier);
        const ciphertextBuf = Buffer.from(ciphertext);
        const pubkeyBuf = Buffer.from(pubkey);
        const nonceBuf = Buffer.from(nonce);
        const nonceBN = new anchor.BN(nonceBuf, 'le');
        const proposalBn = new anchor.BN(proposalId);

        console.log(`   - Nullifier: ${nullifierBuf.toString('hex').slice(0, 10)}...`);
        console.log(`   - Proposal ID: ${proposalId}`);

        // 2. Derive PDAs
        // ⚠️ FIX 2: MUST USE "proposal_v2" TO MATCH BACKEND
        const [proposalPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("proposal_v2"), proposalBn.toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        // Derive Nullifier PDA (This uses the proposalPda we just calculated)
        const [nullifierPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("nullifier"), proposalPda.toBuffer(), nullifierBuf],
            program.programId
        );

        // 3. Construct Transaction
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

        const transaction = new anchor.web3.Transaction().add(instruction);
        const latestBlockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = latestBlockhash.blockhash;
        transaction.feePayer = relayerWallet.publicKey;
        
        transaction.sign(relayerWallet);
        
        console.log("   🚀 Sending Transaction...");
        const tx = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3,
        });
        
        console.log(`   ✅ Sent! Waiting for confirmation... (${tx})`);
        await connection.confirmTransaction(tx, "confirmed");

        console.log("   🎉 Transaction Confirmed");
        
        res.json({ 
            success: true, 
            tx: tx,
            explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`
        });

    } catch (error) {
        // Safe way to extract message from unknown error
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        console.error("❌ Relay Error:", errorMessage);
        
        // Handle "Account already exists" (Double Vote attempt)
        if (errorMessage.includes("already in use")) {
            res.status(400).json({ 
                success: false, 
                error: "Double Vote Detected (Nullifier Used)" 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: errorMessage 
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`📡 Relayer listening on http://localhost:${PORT}`);
});