import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolvoteChain } from "../target/types/solvote_chain";
import { Connection, PublicKey } from "@solana/web3.js";

async function main() {
  // 1. Force connection to public Devnet
  const endpoint = "https://api.devnet.solana.com";
  const connection = new Connection(endpoint, "confirmed");

  // 2. Setup Provider manually
  const wallet = anchor.Wallet.local(); // Uses ~/.config/solana/id.json
  const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.SolvoteChain as Program<SolvoteChain>;

  const PROPOSAL_ID = new anchor.BN(1);
  const SOL_MINT = new PublicKey("11111111111111111111111111111111");
  
  // For demo: Use zero root (will be computed properly in production)
  // In production, you'd compute the Merkle root from eligible voters list
  const MERKLE_ROOT = new Uint8Array(32).fill(0); // Zero root for demo

  console.log("Using RPC:", endpoint);
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Merkle Root:", Buffer.from(MERKLE_ROOT).toString('hex'));

  try {
    const tx = await program.methods
      .initializeProposal(PROPOSAL_ID, SOL_MINT, Array.from(MERKLE_ROOT))
      .accounts({
        authority: wallet.publicKey,
      })
      .rpc();

    console.log("✅ Proposal Initialized!");
    console.log("Transaction Signature:", tx);
  } catch (err: any) {
    if (err.message.includes("already in use")) {
        console.log("ℹ️ Proposal #1 is already initialized.");
    } else {
        console.error("❌ Initialization failed:", err);
    }
  }
}

main().catch(console.error);