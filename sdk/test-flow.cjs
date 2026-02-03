const { SvrnClient } = require('./dist/index.js');
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// 1. Setup
const RELAYER_URL = "https://missed-insulin-infrastructure-vids.trycloudflare.com";
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const testUser = Keypair.generate();

async function runTest() {
    console.log("Starting Full SDK Integration Test...");
    
    // Airdrop some SOL so the test user can pay for the proposal
    const sig = await connection.requestAirdrop(testUser.publicKey, 1 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);

    const wallet = new Wallet(testUser);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const client = new SvrnClient(RELAYER_URL);

    try {
        // Step 1: Initialize Prover (Loads WASM)
        console.log("Initializing ZK Prover...");
        const circuitJson = require('./circuit.json'); // Path to your Noir circuit JSON
        await client.init(circuitJson);

        // Step 2: Create Proposal
        console.log("Creating Proposal...");
        const metadata = { title: "Test Prop", desc: "Testing SDK", duration: 24 };
        const { proposalId, txid } = await client.createProposal(
            provider, 
            testUser.publicKey, 
            "So11111111111111111111111111111111111111112", // Native SOL mint for testing
            metadata, 
            0.05 // gas buffer
        );
        console.log(`Proposal #${proposalId} created! TX: ${txid}`);

        // Step 3: Cast Vote
        console.log("Casting Vote...");
        const voteRes = await client.castVote(provider, testUser.publicKey.toBase58(), proposalId, 1);
        if (voteRes.success) {
            console.log(`Vote successful! Relayed TX: ${voteRes.tx}`);
        } else {
            console.error(`Vote failed: ${voteRes.error}`);
        }

    } catch (err) {
        console.error("Test crashed:", error);
    }
}

runTest();