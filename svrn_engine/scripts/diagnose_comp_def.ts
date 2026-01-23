import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getClusterAccAddress,
  getArciumAccountBaseSeed,
  getArciumProgramId,
} from "@arcium-hq/client";
import * as fs from "fs";

async function main() {
  const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(RPC_URL, "confirmed");
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const programId = new PublicKey(idl.address);

  console.log("🔍 Comprehensive Computation Definition Diagnosis...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  // 1. Check MXE Account
  const mxeAccount = getMXEAccAddress(programId);
  const mxeInfo = await connection.getAccountInfo(mxeAccount);
  console.log("1️⃣  MXE Account:");
  if (mxeInfo) {
    console.log("   ✅ EXISTS (", mxeInfo.data.length, "bytes)");
    console.log("   Owner:", mxeInfo.owner.toBase58());
  } else {
    console.log("   ❌ MISSING - This is required!");
    return;
  }
  console.log("");

  // 2. Check Cluster Account
  const clusterOffset = 456;
  const clusterPda = getClusterAccAddress(clusterOffset);
  const clusterInfo = await connection.getAccountInfo(clusterPda);
  console.log("2️⃣  Cluster Account:");
  if (clusterInfo) {
    console.log("   ✅ EXISTS (offset:", clusterOffset, ",", clusterInfo.data.length, "bytes)");
    console.log("   Owner:", clusterInfo.owner.toBase58());
  } else {
    console.log("   ❌ MISSING - MXE may not be admitted to cluster");
    return;
  }
  console.log("");

  // 3. Check Computation Definition
  const compDefAccount = getCompDefAccAddress(
    programId,
    Buffer.from(getCompDefAccOffset("add_together")).readUInt32LE()
  );
  const compDefInfo = await connection.getAccountInfo(compDefAccount);
  console.log("3️⃣  Computation Definition Account:");
  if (compDefInfo) {
    console.log("   ✅ EXISTS (", compDefInfo.data.length, "bytes)");
    console.log("   Owner:", compDefInfo.owner.toBase58());
    
    // Decode to check state
    // Structure: finalization_authority (option pubkey) + cu_amount (u64) + definition + circuit_source + bump
    if (compDefInfo.data.length >= 8) {
      const data = compDefInfo.data;
      console.log("   First 8 bytes (discriminator):", data.slice(0, 8).toString('hex'));
      if (data.length >= 40) {
        // Check finalization_authority (option pubkey = 1 byte + 32 bytes)
        const finalizationAuth = data[8]; // 0 = None, 1 = Some
        console.log("   Finalization authority:", finalizationAuth === 0 ? "None (not finalized)" : "Set (finalized)");
      }
    }
  } else {
    console.log("   ❌ MISSING");
    return;
  }
  console.log("");

  // 4. Check Circuit Account
  const baseSeed = getArciumAccountBaseSeed("RawCircuitAccount");
  const offset = getCompDefAccOffset("add_together");
  const circuitPDA = PublicKey.findProgramAddressSync(
    [baseSeed, programId.toBuffer(), offset],
    getArciumProgramId(),
  )[0];
  
  const circuitInfo = await connection.getAccountInfo(circuitPDA);
  console.log("4️⃣  Circuit Account (Expected PDA):");
  console.log("   Expected:", circuitPDA.toString());
  console.log("   Actual (from error): 4z8sLUsmAgYY3FrcSQEZdVgLJ2DAraC1ip1KR9KqHE7M");
  if (circuitInfo) {
    console.log("   ✅ EXISTS at expected PDA (", circuitInfo.data.length, "bytes)");
  } else {
    // Check the actual circuit account
    const actualCircuit = new PublicKey("4z8sLUsmAgYY3FrcSQEZdVgLJ2DAraC1ip1KR9KqHE7M");
    const actualInfo = await connection.getAccountInfo(actualCircuit);
    if (actualInfo) {
      console.log("   ⚠️  EXISTS at different address:", actualCircuit.toString());
      console.log("   Size:", actualInfo.data.length, "bytes");
      console.log("   ⚠️  MISMATCH - Circuit account address doesn't match expected PDA!");
      console.log("   This could cause InvalidComputationOffset errors.");
    } else {
      console.log("   ❌ NOT FOUND");
    }
  }
  console.log("");

  // 5. Summary and Recommendations
  console.log("💡 Diagnosis Summary:");
  const allGood = mxeInfo && clusterInfo && compDefInfo && circuitInfo;
  
  if (allGood && circuitPDA.toString() === "4z8sLUsmAgYY3FrcSQEZdVgLJ2DAraC1ip1KR9KqHE7M") {
    console.log("   ✅ All accounts exist and addresses match");
    console.log("   → The InvalidComputationOffset error might be due to:");
    console.log("     1. Computation definition not properly finalized");
    console.log("     2. Circuit not properly linked to computation definition");
    console.log("     3. MXE/cluster state mismatch");
    console.log("");
    console.log("   💡 Recommendation: Try off-chain storage to avoid circuit linking issues");
  } else if (circuitPDA.toString() !== "4z8sLUsmAgYY3FrcSQEZdVgLJ2DAraC1ip1KR9KqHE7M") {
    console.log("   ⚠️  Circuit account address mismatch detected!");
    console.log("   → This is likely the root cause of InvalidComputationOffset");
    console.log("   → The computation definition may be pointing to wrong circuit account");
    console.log("");
    console.log("   💡 Recommendation: Switch to off-chain storage or reinitialize properly");
  } else {
    console.log("   ⚠️  Some accounts are missing");
  }
}

main().catch(console.error);

