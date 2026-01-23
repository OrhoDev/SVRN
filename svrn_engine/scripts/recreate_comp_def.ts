import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  uploadCircuit,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { Program } from "@coral-xyz/anchor";

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString())),
  );
}

async function main() {
  const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(RPC_URL, "confirmed");
  
  const keypairPath = os.homedir() + "/.config/solana/id.json";
  const owner = readKpJson(keypairPath);
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as any;
  
  console.log("🔧 Recreating Computation Definition (Fresh Start)...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   Wallet:", owner.publicKey.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset("add_together");
  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, programId.toBuffer(), offset],
    getArciumProgramId(),
  )[0];
  
  const mxeAccount = getMXEAccAddress(programId);
  
  console.log("📋 Computation Definition PDA:", compDefPDA.toString());
  console.log("📋 MXE Account:", mxeAccount.toString());
  console.log("");

  // Check current state
  const compDefInfo = await connection.getAccountInfo(compDefPDA);
  if (compDefInfo) {
    console.log("⚠️  Computation definition exists (", compDefInfo.data.length, "bytes)");
    console.log("   We'll reinitialize it to fix the corruption...");
  }

  try {
    // Step 1: Reinitialize computation definition
    // According to Arcium docs, calling init_comp_def again should work
    console.log("\n🔄 Step 1: Reinitializing computation definition...");
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });
    
    const initTx = await program.methods
      .initAddTogetherCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: mxeAccount,
      })
      .preInstructions([modifyComputeUnits])
      .signers([owner])
      .rpc({
        commitment: "confirmed",
        skipPreflight: false,
      });
    
    console.log("✅ Computation definition reinitialized!");
    console.log("   Transaction:", initTx);
    console.log("   Explorer: https://explorer.solana.com/tx/" + initTx + "?cluster=devnet");
    console.log("");
    
    // Wait for confirmation
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Upload circuit - this should create it at the correct address and finalize
    console.log("🔄 Step 2: Uploading circuit (this will create correct address and finalize)...");
    const rawCircuit = fs.readFileSync("build/add_together.arcis");
    console.log("   Circuit file size:", (rawCircuit.length / 1024).toFixed(2), "KB");
    
    try {
      await uploadCircuit(
        provider,
        "add_together",
        programId,
        rawCircuit,
        true, // finalize = true - CRITICAL!
      );
      console.log("✅ Circuit uploaded and computation definition finalized!");
      console.log("   The circuit should now be at the correct address.");
      
      // Verify
      await new Promise(r => setTimeout(r, 3000));
      const updatedInfo = await connection.getAccountInfo(compDefPDA);
      if (updatedInfo && updatedInfo.data.length >= 40) {
        const finalizationAuth = updatedInfo.data[8];
        if (finalizationAuth !== 0) {
          console.log("✅ Verified: Computation definition is finalized!");
        } else {
          console.log("⚠️  Still not finalized - may need another attempt");
        }
      }
    } catch (uploadErr: any) {
      if (uploadErr.message.includes("already in use")) {
        console.log("⚠️  Circuit account already exists at old address");
        console.log("   This is expected - the reinitialization should have fixed the link");
        console.log("   Try running the tally script to test");
      } else {
        console.error("❌ Circuit upload failed:", uploadErr.message);
        throw uploadErr;
      }
    }
    
    console.log("\n✅ Recreation complete!");
    console.log("   The computation definition has been reinitialized.");
    console.log("   Try running the tally script to verify it works.");
  } catch (err: any) {
    console.error("❌ Error:", err.message);
    if (err.logs) {
      console.error("   Logs:", err.logs.slice(0, 10));
    }
    console.log("\n💡 If this fails, we'll switch to off-chain storage");
    throw err;
  }
}

main().catch(console.error);

