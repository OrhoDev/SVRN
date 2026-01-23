import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { SvrnEngine } from "../target/types/svrn_engine";
import {
  getCompDefAccOffset,
  buildFinalizeCompDefTx,
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

  // Load IDL and create Program instance
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const program = new Program(idl, provider) as Program<SvrnEngine>;
  const programId = program.programId;

  console.log("🔧 Finalizing computation definition...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   Wallet:", owner.publicKey.toBase58());

  try {
    const offset = getCompDefAccOffset("add_together");
    
    console.log("   Building finalization transaction...");
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      Buffer.from(offset).readUInt32LE(),
      programId,
    );

    const latestBlockhash = await connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    finalizeTx.sign(owner);

    console.log("   Sending transaction...");
    const finalizeSig = await connection.sendRawTransaction(finalizeTx.serialize());
    await connection.confirmTransaction(finalizeSig, "confirmed");
    
    console.log("✅ Computation definition finalized!");
    console.log("   Transaction:", finalizeSig);
    console.log("   Explorer: https://explorer.solana.com/tx/" + finalizeSig + "?cluster=devnet");
    console.log("\n⏳ Waiting for keygen to complete (this may take a few minutes)...");
  } catch (err: any) {
    if (err.message.includes("already finalized") || err.message.includes("already in use")) {
      console.log("✅ Computation definition already finalized!");
    } else {
      console.error("❌ Error:", err.message);
      throw err;
    }
  }
}

main().catch(console.error);

