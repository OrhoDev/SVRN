import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
    getArciumAccountBaseSeed,
    getArciumProgramId,
    getMXEAccAddress,
    getCompDefAccOffset,
    buildFinalizeCompDefTx,
    uploadCircuit,
} from "@arcium-hq/client";
import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

async function main() {
    const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(RPC_URL, "confirmed");
    
    // Load relayer keypair
    const keypairData = JSON.parse(fs.readFileSync('./relayer-keypair.json', 'utf-8'));
    const owner = Keypair.fromSecretKey(new Uint8Array(keypairData));
    const wallet = new anchor.Wallet(owner);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    
    // Arcium program ID (the MXE program we deployed)
    const PROGRAM_ID = new PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS");
    
    console.log("🔧 Finalizing Computation Definition...");
    console.log("   RPC:", RPC_URL);
    console.log("   Wallet:", owner.publicKey.toBase58());
    console.log("   Program:", PROGRAM_ID.toBase58());
    
    // Get computation definition PDA
    const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset("add_together");
    const compDefPDA = PublicKey.findProgramAddressSync(
        [baseSeedCompDefAcc, PROGRAM_ID.toBuffer(), offset],
        getArciumProgramId(),
    )[0];
    
    console.log("   CompDef PDA:", compDefPDA.toBase58());
    
    // Check current state
    const compDefInfo = await connection.getAccountInfo(compDefPDA);
    if (!compDefInfo) {
        console.log("❌ Computation definition doesn't exist!");
        return;
    }
    
    console.log("   Current data length:", compDefInfo.data.length, "bytes");
    console.log("   Finalization byte:", compDefInfo.data[8]);
    
    if (compDefInfo.data[8] !== 0) {
        console.log("✅ Already finalized!");
        return;
    }
    
    console.log("\n📤 Uploading circuit...");
    
    // Load the compiled circuit
    const circuitPath = "../svrn_engine/build/add_together.arcis";
    if (!fs.existsSync(circuitPath)) {
        console.log("❌ Circuit file not found:", circuitPath);
        return;
    }
    
    const rawCircuit = fs.readFileSync(circuitPath);
    console.log("   Circuit size:", rawCircuit.length, "bytes");
    
    try {
        // Upload the circuit (order: provider, name, programId, circuit, finalize)
        await (uploadCircuit as any)(
            provider,
            "add_together",
            PROGRAM_ID,  // PublicKey
            rawCircuit,
            true  // finalize after upload
        );
        console.log("✅ Circuit uploaded and finalized!");
        
        // Verify
        const updatedInfo = await connection.getAccountInfo(compDefPDA);
        if (updatedInfo && updatedInfo.data[8] !== 0) {
            console.log("✅ Verified: Computation definition is now finalized!");
        } else {
            console.log("⚠️ Finalization byte still 0 - may need manual finalization");
        }
        
    } catch (e: any) {
        console.log("❌ Error:", e.message);
        if (e.logs) {
            console.log("Logs:", e.logs.slice(0, 10));
        }
    }
}

main().catch(console.error);

