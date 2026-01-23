import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
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
  
  console.log("🔧 Fixing Computation Definition Finalization...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  const offset = getCompDefAccOffset("add_together");
  const compDefAccount = getCompDefAccAddress(
    programId,
    Buffer.from(offset).readUInt32LE()
  );

  // Check current state
  const compDefInfo = await connection.getAccountInfo(compDefAccount);
  if (compDefInfo && compDefInfo.data.length >= 40) {
    const finalizationAuth = compDefInfo.data[8];
    if (finalizationAuth === 0) {
      console.log("⚠️  Computation definition is NOT finalized");
      console.log("   This is the root cause of InvalidComputationOffset!");
    } else {
      console.log("✅ Computation definition is finalized");
    }
  }

  console.log("\n🔄 Attempting to properly finalize computation definition...");
  console.log("   This will link the circuit to the computation definition");
  console.log("");

  try {
    // Try to upload circuit first (this should properly link and finalize)
    console.log("Step 1: Uploading circuit (this will finalize automatically)...");
    const rawCircuit = fs.readFileSync("build/add_together.arcis");
    console.log("   Circuit file size:", (rawCircuit.length / 1024).toFixed(2), "KB");
    
    try {
      await uploadCircuit(
        provider,
        "add_together",
        programId,
        rawCircuit,
        true, // finalize = true - this is critical!
      );
      console.log("✅ Circuit uploaded and computation definition finalized!");
      
      // Verify finalization
      await new Promise(r => setTimeout(r, 2000)); // Wait for confirmation
      const updatedInfo = await connection.getAccountInfo(compDefAccount);
      if (updatedInfo && updatedInfo.data.length >= 40) {
        const finalizationAuth = updatedInfo.data[8];
        if (finalizationAuth !== 0) {
          console.log("✅ Verified: Computation definition is now finalized!");
        } else {
          console.log("⚠️  Still not finalized - trying manual finalization...");
          throw new Error("Still not finalized");
        }
      }
    } catch (uploadErr: any) {
      if (uploadErr.message.includes("already in use")) {
        console.log("⚠️  Circuit account already exists");
        console.log("   Trying manual finalization...");
        
        // Manual finalization
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
        
        console.log("✅ Computation definition finalized manually!");
        console.log("   Transaction:", finalizeSig);
        
        // Verify
        await new Promise(r => setTimeout(r, 2000));
        const updatedInfo = await connection.getAccountInfo(compDefAccount);
        if (updatedInfo && updatedInfo.data.length >= 40) {
          const finalizationAuth = updatedInfo.data[8];
          if (finalizationAuth !== 0) {
            console.log("✅ Verified: Computation definition is now finalized!");
          } else {
            console.log("❌ Still not finalized after manual attempt");
            console.log("   The computation definition may need to be reinitialized");
          }
        }
      } else {
        throw uploadErr;
      }
    }
    
    console.log("\n✅ Fix complete! Try running the tally script again.");
  } catch (err: any) {
    console.error("❌ Error:", err.message);
    if (err.logs) {
      console.error("   Logs:", err.logs);
    }
    console.log("\n💡 If this fails, consider switching to off-chain storage");
    throw err;
  }
}

main().catch(console.error);

