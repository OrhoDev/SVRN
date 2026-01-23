import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  uploadCircuit,
  buildFinalizeCompDefTx,
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
  
  // Load keypair
  const keypairPath = os.homedir() + "/.config/solana/id.json";
  const owner = readKpJson(keypairPath);
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);
  
  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as any;
  
  console.log("🔧 Re-initializing Computation Definition (per Arcium docs)...");
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

  try {
    // Step 1: Reinitialize the computation definition
    // According to Arcium docs, we can call init_comp_def again to reinitialize
    console.log("🔄 Step 1: Reinitializing computation definition...");
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

    // Step 2: Upload circuit (this will link it to the computation definition)
    // Even if the circuit account exists, we need to ensure it's properly linked
    console.log("🔄 Step 2: Uploading circuit to link with computation definition...");
    try {
      const rawCircuit = fs.readFileSync("build/add_together.arcis");
      console.log("   Circuit file size:", (rawCircuit.length / 1024).toFixed(2), "KB");
      
      await uploadCircuit(
        provider,
        "add_together",
        program.programId,
        rawCircuit,
        true, // finalize after upload
      );
      console.log("✅ Circuit uploaded and computation definition finalized!");
      console.log("   The computation definition is now properly linked to the circuit.");
    } catch (uploadErr: any) {
      if (uploadErr.message.includes("already in use")) {
        console.log("⚠️  Circuit account already exists (this is OK)");
        console.log("   Finalizing computation definition to ensure proper linking...");
        
        // Finalize manually to ensure proper linking
        const finalizeTx = await buildFinalizeCompDefTx(
          provider,
          Buffer.from(offset).readUInt32LE(),
          program.programId,
        );

        const latestBlockhash = await connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

        finalizeTx.sign(owner);

        const finalizeSig = await connection.sendRawTransaction(finalizeTx.serialize());
        await connection.confirmTransaction(finalizeSig, "confirmed");
        
        console.log("✅ Computation definition finalized!");
        console.log("   Transaction:", finalizeSig);
        console.log("   Explorer: https://explorer.solana.com/tx/" + finalizeSig + "?cluster=devnet");
      } else {
        console.error("❌ Circuit upload failed:", uploadErr.message);
        throw uploadErr;
      }
    }
    
    console.log("\n✅ Computation definition reinitialization complete!");
    console.log("   The computation definition should now be properly linked to the circuit.");
    console.log("   You can now try running the tally script again.");
  } catch (err: any) {
    if (err.message.includes("already in use") || err.message.includes("already initialized")) {
      console.log("⚠️  Computation definition already initialized");
      console.log("   Trying to finalize to ensure proper linking...");
      
      try {
        const finalizeTx = await buildFinalizeCompDefTx(
          provider,
          Buffer.from(offset).readUInt32LE(),
          program.programId,
        );

        const latestBlockhash = await connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

        finalizeTx.sign(owner);

        const finalizeSig = await connection.sendRawTransaction(finalizeTx.serialize());
        await connection.confirmTransaction(finalizeSig, "confirmed");
        
        console.log("✅ Computation definition finalized!");
        console.log("   Transaction:", finalizeSig);
      } catch (finalizeErr: any) {
        console.error("❌ Finalization failed:", finalizeErr.message);
        throw finalizeErr;
      }
    } else {
      console.error("❌ Error:", err.message);
      throw err;
    }
  }
}

main().catch(console.error);

