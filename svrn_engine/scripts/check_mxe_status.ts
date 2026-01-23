import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
} from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
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
  
  // Load IDL to get program ID
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const programId = new PublicKey(idl.address);

  console.log("🔍 Checking MXE Account Status...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  // Check MXE account
  const mxeAccount = getMXEAccAddress(programId);
  const mxeInfo = await connection.getAccountInfo(mxeAccount);
  
  console.log("📋 MXE Account:");
  console.log("   Address:", mxeAccount.toBase58());
  if (mxeInfo) {
    console.log("   ✅ EXISTS (", mxeInfo.data.length, "bytes)");
    console.log("   Owner:", mxeInfo.owner.toBase58());
  } else {
    console.log("   ❌ DOES NOT EXIST");
    console.log("   → Run: arcium deploy --skip-deploy --cluster-offset 456 --recovery-set-size 4");
  }
  console.log("");

  // Check computation definition account
  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset("add_together");
  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, programId.toBuffer(), offset],
    getArciumProgramId(),
  )[0];
  
  const compDefInfo = await connection.getAccountInfo(compDefPDA);
  
  console.log("📋 Computation Definition Account:");
  console.log("   Address:", compDefPDA.toBase58());
  if (compDefInfo) {
    console.log("   ✅ EXISTS (", compDefInfo.data.length, "bytes)");
    console.log("   Owner:", compDefInfo.owner.toBase58());
  } else {
    console.log("   ❌ DOES NOT EXIST");
    console.log("   → Run initialization script after MXE account is created");
  }
  console.log("");

  // Summary
  if (!mxeInfo) {
    console.log("❌ MXE Account not initialized. Use 'arcium deploy --skip-deploy' to initialize it.");
  } else if (!compDefInfo) {
    console.log("⚠️  MXE Account exists but computation definition not initialized.");
    console.log("   Run: yarn run init-mxe");
  } else {
    console.log("✅ Both MXE account and computation definition are initialized!");
  }
}

main().catch(console.error);

