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
  
  // Load IDL to get program ID
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const programId = new PublicKey(idl.address);

  console.log("🔍 Verifying Computation Definition...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  // Check computation definition account
  const compDefAccount = getCompDefAccAddress(
    programId,
    Buffer.from(getCompDefAccOffset("add_together")).readUInt32LE()
  );
  
  const compDefInfo = await connection.getAccountInfo(compDefAccount);
  
  console.log("📋 Computation Definition Account:");
  console.log("   Address:", compDefAccount.toString());
  if (compDefInfo) {
    console.log("   ✅ EXISTS (", compDefInfo.data.length, "bytes)");
    console.log("   Owner:", compDefInfo.owner.toBase58());
    
    // Try to decode the account data to see if it's initialized
    // Arcium computation definition accounts should have specific structure
    if (compDefInfo.data.length < 8) {
      console.log("   ⚠️  Account data too small - might not be initialized");
    } else {
      console.log("   📊 First 32 bytes (hex):", compDefInfo.data.slice(0, 32).toString('hex'));
    }
  } else {
    console.log("   ❌ DOES NOT EXIST");
    console.log("   → Run: yarn run init-mxe");
    return;
  }
  
  // Check if circuit account exists
  const baseSeed = getArciumAccountBaseSeed("RawCircuitAccount");
  const circuitPDA = PublicKey.findProgramAddressSync(
    [baseSeed, programId.toBuffer(), Buffer.from(getCompDefAccOffset("add_together"))],
    getArciumProgramId(),
  )[0];
  
  const circuitInfo = await connection.getAccountInfo(circuitPDA);
  console.log("\n📋 Circuit Account:");
  console.log("   Address:", circuitPDA.toString());
  if (circuitInfo) {
    console.log("   ✅ EXISTS (", circuitInfo.data.length, "bytes)");
    console.log("   Owner:", circuitInfo.owner.toBase58());
  } else {
    console.log("   ❌ DOES NOT EXIST");
    console.log("   → Circuit needs to be uploaded");
  }
  
  console.log("\n💡 Summary:");
  if (compDefInfo && circuitInfo) {
    console.log("   ✅ Both computation definition and circuit exist");
    console.log("   → If you're getting InvalidComputationOffset, the computation definition");
    console.log("     might need to be re-initialized to properly link to the circuit.");
  } else if (compDefInfo && !circuitInfo) {
    console.log("   ⚠️  Computation definition exists but circuit is missing");
    console.log("   → Run: yarn run init-mxe to upload circuit");
  }
}

main().catch(console.error);

