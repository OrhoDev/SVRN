import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
} from "@arcium-hq/client";
import * as fs from "fs";

async function main() {
  const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(RPC_URL, "confirmed");
  
  // Old working program ID
  const OLD_PROGRAM_ID = new PublicKey("EHrk99MfK3cTsYB75mvmfpzd2NFDEP2LpVVtJwUD81fT");

  console.log("🔍 Checking OLD Program ID MXE Status...");
  console.log("   Program ID:", OLD_PROGRAM_ID.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  // Check MXE account
  const mxeAccount = getMXEAccAddress(OLD_PROGRAM_ID);
  const mxeInfo = await connection.getAccountInfo(mxeAccount);
  
  console.log("📋 MXE Account:");
  console.log("   Address:", mxeAccount.toBase58());
  if (mxeInfo) {
    console.log("   ✅ EXISTS (", mxeInfo.data.length, "bytes)");
    console.log("   Owner:", mxeInfo.owner.toBase58());
  } else {
    console.log("   ❌ DOES NOT EXIST");
  }
  console.log("");

  // Check computation definition account
  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset("add_together");
  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, OLD_PROGRAM_ID.toBuffer(), offset],
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
  }
  console.log("");

  // Summary
  if (!mxeInfo) {
    console.log("❌ MXE Account not initialized for old program ID.");
  } else if (!compDefInfo) {
    console.log("⚠️  MXE Account exists but computation definition not initialized.");
  } else {
    console.log("✅ Both MXE account and computation definition are initialized!");
    console.log("   Ready for voting and tallying!");
  }
}

main().catch(console.error);

