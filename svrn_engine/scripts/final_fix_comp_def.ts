import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  buildFinalizeCompDefTx,
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
  
  console.log("🔧 Final Fix: Computation Definition Finalization");
  console.log("   Program ID:", programId.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  const offset = getCompDefAccOffset("add_together");
  const compDefAccount = getCompDefAccAddress(
    programId,
    Buffer.from(offset).readUInt32LE()
  );
  const mxeAccount = getMXEAccAddress(programId);

  // Check current state
  const compDefInfo = await connection.getAccountInfo(compDefAccount);
  if (compDefInfo) {
    const finalizationAuth = compDefInfo.data.length >= 40 ? compDefInfo.data[8] : 0;
    console.log("📋 Current State:");
    console.log("   Computation Definition:", compDefAccount.toString());
    console.log("   Finalized:", finalizationAuth !== 0 ? "✅ YES" : "❌ NO");
    console.log("   Size:", compDefInfo.data.length, "bytes");
    console.log("");
  }

  console.log("🔄 Attempting comprehensive fix...");
  console.log("");

  // Strategy: Try to reinitialize, then upload circuit, then finalize
  try {
    // Step 1: Reinitialize computation definition
    console.log("Step 1: Reinitializing computation definition...");
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });
    
    try {
      const initTx = await program.methods
        .initAddTogetherCompDef()
        .accounts({
          compDefAccount: compDefAccount,
          payer: owner.publicKey,
          mxeAccount: mxeAccount,
        })
        .preInstructions([modifyComputeUnits])
        .signers([owner])
        .rpc({
          commitment: "confirmed",
          skipPreflight: false,
        });
      
      console.log("   ✅ Reinitialized (tx:", initTx, ")");
      await new Promise(r => setTimeout(r, 3000)); // Wait for confirmation
    } catch (initErr: any) {
      if (initErr.message.includes("already in use") || initErr.message.includes("already initialized")) {
        console.log("   ⚠️  Already initialized (continuing...)");
      } else {
        console.log("   ⚠️  Reinitialization failed:", initErr.message);
      }
    }

    // Step 2: Upload circuit with finalize=true
    console.log("\nStep 2: Uploading circuit (with finalize=true)...");
    const rawCircuit = fs.readFileSync("build/add_together.arcis");
    console.log("   Circuit size:", (rawCircuit.length / 1024).toFixed(2), "KB");
    
    try {
      await uploadCircuit(
        provider,
        "add_together",
        programId,
        rawCircuit,
        true, // CRITICAL: finalize = true
      );
      console.log("   ✅ Circuit uploaded and finalized!");
      await new Promise(r => setTimeout(r, 3000));
    } catch (uploadErr: any) {
      if (uploadErr.message.includes("already in use")) {
        console.log("   ⚠️  Circuit account exists (trying manual finalization...)");
      } else {
        console.log("   ❌ Upload failed:", uploadErr.message);
      }
    }

    // Step 3: Manual finalization (even if upload succeeded, ensure it's finalized)
    console.log("\nStep 3: Ensuring finalization...");
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      Buffer.from(offset).readUInt32LE(),
      programId,
    );

    const latestBlockhash = await connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    finalizeTx.sign(owner);

    const finalizeSig = await connection.sendRawTransaction(finalizeTx.serialize());
    await connection.confirmTransaction(finalizeSig, "confirmed");
    
    console.log("   ✅ Finalization transaction sent:", finalizeSig);
    await new Promise(r => setTimeout(r, 3000));

    // Step 4: Verify finalization
    console.log("\nStep 4: Verifying finalization...");
    const updatedInfo = await connection.getAccountInfo(compDefAccount);
    if (updatedInfo && updatedInfo.data.length >= 40) {
      const finalizationAuth = updatedInfo.data[8];
      if (finalizationAuth !== 0) {
        console.log("   ✅ SUCCESS! Computation definition is now finalized!");
        console.log("   You can now try running the tally script.");
      } else {
        console.log("   ❌ Still not finalized after all attempts");
        console.log("   → The computation definition account may be corrupted");
        console.log("   → Recommendation: Switch to off-chain storage");
      }
    } else {
      console.log("   ⚠️  Could not verify finalization state");
    }

  } catch (err: any) {
    console.error("❌ Error:", err.message);
    if (err.logs) {
      console.error("   Logs:", err.logs.slice(0, 5));
    }
    console.log("\n💡 Recommendation: Switch to off-chain storage");
    console.log("   This avoids circuit account linking issues");
  }
}

main().catch(console.error);

