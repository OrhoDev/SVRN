import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
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
  
  console.log("🔧 Re-initializing Computation Definition...");
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
    // Request maximum compute units
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });
    
    console.log("🔄 Calling initAddTogetherCompDef...");
    const tx = await program.methods
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
    
    console.log("✅ Computation definition re-initialized!");
    console.log("   Transaction:", tx);
    console.log("   Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  } catch (err: any) {
    if (err.message.includes("already in use") || err.message.includes("already initialized")) {
      console.log("✅ Computation definition already initialized (this is OK)");
    } else {
      console.error("❌ Error:", err.message);
      throw err;
    }
  }
}

main().catch(console.error);

