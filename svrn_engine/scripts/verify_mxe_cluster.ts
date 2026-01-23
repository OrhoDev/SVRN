import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
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
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const programId = new PublicKey(idl.address);

  console.log("🔍 Verifying MXE and Cluster Setup...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  // Check MXE account
  const mxeAccount = getMXEAccAddress(programId);
  const mxeInfo = await connection.getAccountInfo(mxeAccount);
  
  console.log("📋 MXE Account:");
  console.log("   Address:", mxeAccount.toString());
  if (mxeInfo) {
    console.log("   ✅ EXISTS (", mxeInfo.data.length, "bytes)");
    console.log("   Owner:", mxeInfo.owner.toBase58());
    
    // Try to decode MXE account to check cluster
    if (mxeInfo.data.length >= 8) {
      console.log("   First 32 bytes (hex):", mxeInfo.data.slice(0, 32).toString('hex'));
    }
  } else {
    console.log("   ❌ DOES NOT EXIST");
    console.log("   → MXE account must be initialized before computation definitions");
    return;
  }
  console.log("");

  // Check cluster account (offset 456)
  const clusterOffset = 456;
  const clusterPda = getClusterAccAddress(clusterOffset);
  const clusterInfo = await connection.getAccountInfo(clusterPda);
  
  console.log("📋 Cluster Account:");
  console.log("   Offset:", clusterOffset);
  console.log("   Address:", clusterPda.toString());
  if (clusterInfo) {
    console.log("   ✅ EXISTS (", clusterInfo.data.length, "bytes)");
    console.log("   Owner:", clusterInfo.owner.toBase58());
  } else {
    console.log("   ❌ DOES NOT EXIST");
    console.log("   → Cluster account missing - MXE may not be admitted to cluster");
    return;
  }
  console.log("");

  // Check computation definition
  const compDefAccount = getCompDefAccAddress(
    programId,
    Buffer.from(getCompDefAccOffset("add_together")).readUInt32LE()
  );
  const compDefInfo = await connection.getAccountInfo(compDefAccount);
  
  console.log("📋 Computation Definition:");
  console.log("   Address:", compDefAccount.toString());
  if (compDefInfo) {
    console.log("   ✅ EXISTS (", compDefInfo.data.length, "bytes)");
    console.log("   Owner:", compDefInfo.owner.toBase58());
  } else {
    console.log("   ❌ DOES NOT EXIST");
  }
  console.log("");

  // Summary
  console.log("💡 Summary:");
  if (mxeInfo && clusterInfo && compDefInfo) {
    console.log("   ✅ All accounts exist");
    console.log("   ✅ MXE is initialized");
    console.log("   ✅ Cluster account exists (MXE should be admitted)");
    console.log("   ✅ Computation definition exists");
    console.log("");
    console.log("   If you're still getting InvalidComputationOffset:");
    console.log("   1. Check if computation definition is properly finalized");
    console.log("   2. Verify circuit is properly linked to computation definition");
    console.log("   3. Check Arcium version compatibility (v0.4.0+ requires different init_comp_def signature)");
  } else {
    console.log("   ⚠️  Some accounts are missing - fix these first");
  }
}

main().catch(console.error);

