import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  uploadCircuit,
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

async function closeAccount(
  connection: Connection,
  account: PublicKey,
  destination: PublicKey,
  owner: anchor.web3.Keypair,
): Promise<string> {
  const accountInfo = await connection.getAccountInfo(account);
  if (!accountInfo) {
    throw new Error("Account does not exist");
  }

  const lamports = accountInfo.lamports;
  if (lamports === 0) {
    throw new Error("Account has no lamports to close");
  }

  const transaction = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: account,
      toPubkey: destination,
      lamports: lamports,
    }),
    SystemProgram.assign({
      accountPubkey: account,
      programId: SystemProgram.programId,
    }),
  );

  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.feePayer = owner.publicKey;
  transaction.sign(owner);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(signature, "confirmed");
  
  return signature;
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
  const program = new Program(idl, provider) as any;
  
  console.log("🔧 Closing and Recreating Computation Definition...");
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

  // Check if account exists
  const compDefInfo = await connection.getAccountInfo(compDefPDA);
  if (!compDefInfo) {
    console.log("✅ Account doesn't exist - we can create it fresh!");
  } else {
    console.log("⚠️  Account exists (", compDefInfo.data.length, "bytes)");
    console.log("   Owner:", compDefInfo.owner.toBase58());
    console.log("   Lamports:", compDefInfo.lamports / 1e9, "SOL");
    
    // Check if we can close it
    if (compDefInfo.owner.equals(SystemProgram.programId)) {
      console.log("   ⚠️  Account is owned by System Program - can't close directly");
      console.log("   → The account must be closed by the Arcium program");
      console.log("   → Trying to reinitialize anyway (Arcium should handle it)...");
    } else if (compDefInfo.owner.equals(getArciumProgramId())) {
      console.log("   ⚠️  Account is owned by Arcium Program - can't close directly");
      console.log("   → Trying alternative approach: upload circuit and finalize");
      console.log("   → This should fix the linking without closing");
      
      // Try to just upload circuit and finalize
      console.log("\n🔄 Uploading circuit to fix linking...");
      const rawCircuit = fs.readFileSync("build/add_together.arcis");
      
      try {
        await uploadCircuit(
          provider,
          "add_together",
          programId,
          rawCircuit,
          true, // finalize
        );
        console.log("✅ Circuit uploaded and finalized!");
        console.log("   Try running the tally script now.");
        return;
      } catch (uploadErr: any) {
        console.log("❌ Upload failed:", uploadErr.message);
        console.log("   → We need to switch to off-chain storage");
        throw uploadErr;
      }
    }
  }

  // Try to reinitialize
  console.log("\n🔄 Attempting to reinitialize...");
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1_400_000,
  });
  
  try {
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
    
    console.log("✅ Reinitialized!");
    console.log("   Transaction:", initTx);
    
    // Upload circuit
    console.log("\n🔄 Uploading circuit...");
    const rawCircuit = fs.readFileSync("build/add_together.arcis");
    await uploadCircuit(provider, "add_together", programId, rawCircuit, true);
    console.log("✅ Complete!");
  } catch (err: any) {
    if (err.message.includes("already in use")) {
      console.log("❌ Cannot reinitialize - account exists and can't be closed");
      console.log("   → Switching to off-chain storage is the best solution");
      throw new Error("Account cannot be recreated - use off-chain storage");
    } else {
      throw err;
    }
  }
}

main().catch(console.error);

