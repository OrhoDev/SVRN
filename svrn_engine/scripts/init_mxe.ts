import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import { SvrnEngine } from "../target/types/svrn_engine";
import {
  getArciumAccountBaseSeed,
  getArciumProgramId,
  getMXEAccAddress,
  getCompDefAccOffset,
  buildFinalizeCompDefTx,
  uploadCircuit,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString())),
  );
}

async function main() {
  // Setup - Use devnet (change if using different cluster)
  const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(RPC_URL, "confirmed");
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  
  console.log("🌐 Using RPC:", RPC_URL);

  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const program = new Program(idl, provider) as Program<SvrnEngine>;

  console.log("🔧 Initializing SVRN Engine MXE Account...");
  console.log("   Program ID:", program.programId.toBase58());
  console.log("   Wallet:", owner.publicKey.toBase58());

  try {
    // Get computation definition offset and PDA
    const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset("add_together");
    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgramId(),
    )[0];

    // Check if MXE account already exists
    const mxeAccount = getMXEAccAddress(program.programId);
    const accountInfo = await connection.getAccountInfo(mxeAccount);
    
    let needsInit = !accountInfo;
    let needsFinalize = false;

    if (needsInit) {
      console.log("📝 MXE Account does not exist. Initializing...");
      console.log("   Comp Def PDA:", compDefPDA.toBase58());

      const sig = await program.methods
        .initAddTogetherCompDef()
        .accounts({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: mxeAccount,
        })
        .signers([owner])
        .rpc({
          commitment: "confirmed",
        });

      console.log("✅ MXE Account initialized!");
      console.log("   Transaction:", sig);
      console.log("   Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
      
      // Upload circuit file (for large circuits, this avoids CU amount issues)
      console.log("\n📤 Uploading circuit file...");
      try {
        const rawCircuit = fs.readFileSync("build/add_together.arcis");
        await uploadCircuit(
          provider,
          "add_together",
          program.programId,
          rawCircuit,
          true, // finalize after upload
        );
        console.log("✅ Circuit uploaded and computation definition finalized!");
        needsFinalize = false; // Already finalized by uploadCircuit
      } catch (uploadErr: any) {
        console.log("⚠️  Circuit upload failed, trying finalization instead...");
        console.log("   Error:", uploadErr.message);
        needsFinalize = true;
      }
    } else {
      console.log("✅ MXE Account already exists!");
      // Check if computation definition needs initialization or circuit upload
      const compDefInfo = await connection.getAccountInfo(compDefPDA);
      if (compDefInfo) {
        console.log("📋 Computation definition exists.");
        // For on-chain storage, we need to upload the circuit file
        console.log("   Uploading circuit file for on-chain storage...");
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
          needsFinalize = false;
        } catch (uploadErr: any) {
          console.log("⚠️  Circuit upload failed, trying finalization...");
          console.log("   Error:", uploadErr.message);
          needsFinalize = true; // Try to finalize anyway
        }
      } else {
        console.log("⚠️  Computation definition not found.");
        console.log("   Initializing computation definition (on-chain storage)...");
        
        try {
          // Request maximum compute units for large circuit initialization
          // Add compute budget instructions to request more CU
          const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000, // Maximum CU limit
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
            .transaction();
          
          const sig = await connection.sendTransaction(tx, [owner], {
            skipPreflight: false,
            maxRetries: 3,
          });
          
          await connection.confirmTransaction(sig, "confirmed");
          console.log("✅ Computation definition initialized!");
          console.log("   Transaction:", sig);
          console.log("   Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
          
          // For on-chain storage, we MUST upload the circuit before finalizing
          console.log("\n📤 Uploading circuit file for on-chain storage...");
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
            needsFinalize = false; // Already finalized by uploadCircuit
          } catch (uploadErr: any) {
            console.log("⚠️  Circuit upload failed!");
            console.log("   Error:", uploadErr.message);
            console.log("   Will try to finalize manually...");
            needsFinalize = true; // Try to finalize anyway (might fail)
          }
        } catch (initErr: any) {
          console.log("❌ Initialization failed!");
          console.log("   Error:", initErr.message);
          if (initErr.message.includes("InvalidCUAmount")) {
            console.log("\n⚠️  Still hitting CU limit. This might mean:");
            console.log("   1. The program wasn't properly redeployed with off-chain code");
            console.log("   2. The Arcium program is trying to validate the circuit on-chain");
            console.log("   3. There's a mismatch between the circuit hash and IPFS file");
          }
          throw initErr;
        }
      }
    }

    // Finalize computation definition (required for keygen)
    if (needsFinalize) {
      console.log("\n🔧 Finalizing computation definition...");
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
        console.log("   Explorer: https://explorer.solana.com/tx/" + finalizeSig + "?cluster=devnet");
        console.log("\n⏳ Waiting for keygen to complete (this may take a few minutes)...");
        console.log("   You can try voting now - the frontend will retry until keygen completes.");
      } catch (finalizeErr: any) {
        if (finalizeErr.message.includes("already finalized") || finalizeErr.message.includes("already in use")) {
          console.log("✅ Computation definition already finalized!");
        } else {
          throw finalizeErr;
        }
      }
    } else {
      console.log("✅ Everything is already set up!");
    }
  } catch (err: any) {
    if (err.message.includes("already in use")) {
      console.log("✅ Already initialized!");
    } else {
      console.error("❌ Error:", err.message);
      throw err;
    }
  }
}

main().catch(console.error);

