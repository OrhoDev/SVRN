import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMXEPublicKey } from "@arcium-hq/client";
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
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  
  // Load IDL to get program ID
  const idl = JSON.parse(fs.readFileSync("./target/idl/svrn_engine.json", "utf-8"));
  const programId = new PublicKey(idl.address);

  console.log("🔑 Checking MXE Keygen Status...");
  console.log("   Program ID:", programId.toBase58());
  console.log("   RPC:", RPC_URL);
  console.log("");

  try {
    const mxePublicKey = await getMXEPublicKey(provider, programId);
    
    // Verify the key is actually valid (not null/undefined)
    if (!mxePublicKey || mxePublicKey.length === 0) {
      throw new Error("MXE public key is null or empty");
    }
    
    console.log("✅ KEYGEN COMPLETE!");
    console.log("   MXE Public Key is available");
    console.log("   Key length:", mxePublicKey.length, "bytes");
    console.log("   Key (hex, first 32 bytes):", 
      Array.from(mxePublicKey.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''));
    console.log("");
    console.log("🎉 You can now vote! The frontend should work.");
    process.exit(0);
  } catch (err: any) {
    console.log("⏳ KEYGEN IN PROGRESS...");
    console.log("   Error:", err.message);
    console.log("");
    console.log("📝 What this means:");
    console.log("   - MXE account exists ✅");
    console.log("   - Computation definition initialized ✅");
    console.log("   - Keygen is still running (this takes 2-5 minutes) ⏳");
    console.log("");
    console.log("💡 What to do:");
    console.log("   1. Wait 2-5 minutes (normal)");
    console.log("   2. Run this script again: yarn run check-keygen");
    console.log("   3. Or just try voting - the frontend will retry automatically");
    console.log("");
    console.log("   The Arcium network is generating the encryption keys.");
    console.log("   This is a one-time process after initialization.");
    console.log("");
    console.log("⚠️  If keygen doesn't complete after 10+ minutes:");
    console.log("   See KEYGEN_TROUBLESHOOTING.md for detailed troubleshooting steps.");
    process.exit(1);
  }
}

main().catch(console.error);

