import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
    getArciumAccountBaseSeed,
    getArciumProgramId,
    getMXEAccAddress,
    getCompDefAccOffset,
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
    
    // Arcium program ID
    const PROGRAM_ID = new PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS");
    
    // Load Arcium IDL
    const arciumIdl = JSON.parse(fs.readFileSync('./arcium_idl.json', 'utf-8'));
    const program = new anchor.Program(arciumIdl, provider) as any;
    
    console.log("🔧 Reinitializing Computation Definition...");
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
    
    const mxeAccount = getMXEAccAddress(PROGRAM_ID);
    
    console.log("   CompDef PDA:", compDefPDA.toBase58());
    console.log("   MXE Account:", mxeAccount.toBase58());
    
    // Check current state
    const compDefInfo = await connection.getAccountInfo(compDefPDA);
    if (!compDefInfo) {
        console.log("❌ Computation definition doesn't exist!");
        return;
    }
    
    console.log("   Current data length:", compDefInfo.data.length, "bytes");
    console.log("   Finalization byte:", compDefInfo.data[8]);
    
    // Try calling initAddTogetherCompDef to reinitialize
    console.log("\n📝 Calling initAddTogetherCompDef...");
    
    try {
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 600_000,
        });
        
        const tx = await program.methods
            .initAddTogetherCompDef()
            .accounts({
                compDefAccount: compDefPDA,
                payer: owner.publicKey,
                mxeAccount: mxeAccount,
            })
            .preInstructions([modifyComputeUnits])
            .signers([owner])
            .rpc();
        
        console.log("✅ Transaction sent:", tx);
        
        // Wait a bit and check
        await new Promise(r => setTimeout(r, 3000));
        
        const updatedInfo = await connection.getAccountInfo(compDefPDA);
        if (updatedInfo) {
            console.log("   Updated data length:", updatedInfo.data.length, "bytes");
            console.log("   Updated finalization byte:", updatedInfo.data[8]);
            
            if (updatedInfo.data[8] !== 0) {
                console.log("✅ Computation definition is now finalized!");
            } else {
                console.log("⚠️ Still not finalized - may need circuit upload");
            }
        }
        
    } catch (e: any) {
        console.log("❌ Error:", e.message);
        if (e.logs) {
            console.log("Logs:", e.logs.slice(0, 10));
        }
    }
}

main().catch(console.error);

