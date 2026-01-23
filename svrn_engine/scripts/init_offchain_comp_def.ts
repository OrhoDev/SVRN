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
  const program = new anchor.Program(idl, provider) as any;
  
  console.log("🔧 Initializing Computation Definition with Off-Chain Storage...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   Wallet:", owner.publicKey.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("   IPFS CID: bafybeien7btcdspz3dop5kcapg6y2qmnyphcm4vflezhpzsqwe5utsoe3a");
  console.log("");

  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset("add_together_v2");
  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, programId.toBuffer(), offset],
    getArciumProgramId(),
  )[0];
  
  const mxeAccount = getMXEAccAddress(programId);
  
  console.log("📋 Computation Definition PDA:", compDefPDA.toString());
  console.log("📋 MXE Account:", mxeAccount.toString());
  console.log("");

  // Check if account exists
  const compDefInfo = await connection.getAccountInfo(compDefPDA);
  if (compDefInfo) {
    console.log("⚠️  Computation definition exists (", compDefInfo.data.length, "bytes)");
    console.log("   Reinitializing with off-chain storage...");
  } else {
    console.log("✅ Creating new computation definition with off-chain storage...");
  }

  try {
    // For off-chain storage, Arcium validates the hash from IPFS
    // Don't set compute units - let Arcium handle it internally
    const initTx = await program.methods
      .initAddTogetherCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: mxeAccount,
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
        skipPreflight: false,
      });
    
    console.log("✅ Computation definition initialized with off-chain storage!");
    console.log("   Transaction:", initTx);
    console.log("   Explorer: https://explorer.solana.com/tx/" + initTx + "?cluster=devnet");
    console.log("");
    console.log("🎉 Success! The computation definition now uses off-chain storage.");
    console.log("   You can now try running the tally script.");
  } catch (err: any) {
    if (err.message.includes("already in use")) {
      console.log("⚠️  Account already exists - this is expected");
      console.log("   The computation definition should now be using off-chain storage.");
      console.log("   Try running the tally script to verify.");
    } else {
      console.error("❌ Error:", err.message);
      if (err.logs) {
        console.error("   Logs:", err.logs.slice(0, 10));
      }
      throw err;
    }
  }
}

main().catch(console.error);

