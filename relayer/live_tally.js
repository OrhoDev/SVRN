"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_2 = require("@solana/web3.js");
const fs_2 = __importDefault(require("fs"));
const dotenv_2 = __importDefault(require("dotenv"));
const client_2 = require("@arcium-hq/client");
dotenv_2.default.config();
// 1. CONFIGURATION
const SOLVOTE_ID = new web3_js_2.PublicKey("2BFMGPa8TvvLhyDhND8BXCDLwNibYapp1zsxBXrSrjDg");
// Arcium MXE Program ID (deployed with arcium deploy)
const ARCIUM_ID = new web3_js_2.PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS");
// Note: Using Arcium SDK helper functions instead of manual PDA derivation
// --- MANUAL POLLING HELPER (Bypasses SDK Type Errors) ---
async function waitForComputation(connection, pda) {
    process.stdout.write("   ⏳ Waiting for Arcium Nodes");
    // Poll for 60 seconds
    for (let i = 0; i < 60; i++) {
        const account = await connection.getAccountInfo(pda);
        // Arcium writes the result to the account data.
        // If data exists and is not just the initialization header, we are good.
        if (account && account.data.length > 0) {
            // Check if it's "Completed" (Basic check: data length > 8 bytes discriminator)
            if (account.data.length > 8) {
                console.log(" ✅ Done!");
                return account.data;
            }
        }
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error("Computation timed out.");
}
async function findNextComputationId(connection, clusterOffset) {
    // NOTE: Offsets 0-3 are broken (InvalidComputationOffset error from Arcium)
    // We permanently start from offset 5 to avoid broken offsets and occupied offset 4
    let id = 5; // Start from 5 (skip 0-3 broken, skip 4 which may be occupied)
    while (true) {
        const compOffset = new anchor_1.BN(id);
        const pda = (0, client_2.getComputationAccAddress)(clusterOffset, compOffset);
        const info = await connection.getAccountInfo(pda);
        if (!info)
            return compOffset;
        id++;
        if (id > 1000)
            throw new Error("Too many computations pending cleanup");
    }
}
async function main() {
    console.log("STARTING LIVE ELECTION TALLY...");
    // 2. SETUP
    // Support Helius RPC via environment variable, fallback to localnet for testing
    // const rpcUrl = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
    const rpcUrl = "http://127.0.0.1:8899";
    const connection = new web3_js_2.Connection(rpcUrl, "confirmed");
    const keypairData = JSON.parse(fs_2.default.readFileSync('./relayer-keypair.json', 'utf-8'));
    const keypair = web3_js_2.Keypair.fromSecretKey(new Uint8Array(keypairData));
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    // Load IDLs
    const solanaIdl = JSON.parse(fs_2.default.readFileSync('./idl.json', 'utf-8'));
    const arciumIdl = JSON.parse(fs_2.default.readFileSync('./arcium_idl.json', 'utf-8'));
    const solanaProgram = new anchor_1.Program(solanaIdl, provider);
    const arciumProgram = new anchor_1.Program(arciumIdl, provider);
    // Get Arcium environment (cluster offset)
    // Try to get from environment, fallback to hardcoded value if not set
    let clusterOffset;
    try {
        const arciumEnv = (0, client_2.getArciumEnv)();
        clusterOffset = arciumEnv.arciumClusterOffset;
        console.log(`Using Arcium cluster offset from env: ${clusterOffset}`);
    }
    catch (e) {
        // Fallback to hardcoded cluster offset if env var not set
        // This should match your deployed Arcium cluster offset
        clusterOffset = 456; // Update this to match your actual cluster offset
        console.log(`ARCIUM_CLUSTER_OFFSET not set, using fallback: ${clusterOffset}`);
        console.log(`   Set ARCIUM_CLUSTER_OFFSET=${clusterOffset} in .env file to suppress this warning`);
    }
    // 3. FETCH VOTES
    console.log("Scanning Blockchain for Encrypted Votes...");
    const allVotes = await solanaProgram.account.nullifierAccount.all();
    if (allVotes.length === 0) {
        console.log("No votes found on chain. Go vote in the UI first!");
        return;
    }
    console.log(`Found ${allVotes.length} encrypted ballots.`);
    // 4. PROCESSING LOOP
    let totalYesPower = 0;
    const clusterPda = (0, client_2.getClusterAccAddress)(clusterOffset);
    const mxeAccount = (0, client_2.getMXEAccAddress)(ARCIUM_ID);
    const mempoolAccount = (0, client_2.getMempoolAccAddress)(clusterOffset);
    const executingPool = (0, client_2.getExecutingPoolAccAddress)(clusterOffset);
    const compDefAccount = (0, client_2.getCompDefAccAddress)(ARCIUM_ID, Buffer.from((0, client_2.getCompDefAccOffset)("add_together")).readUInt32LE());
    // Verify computation definition exists and is ready
    const compDefInfo = await connection.getAccountInfo(compDefAccount);
    if (!compDefInfo) {
        console.error(`❌ Computation definition account not found: ${compDefAccount.toString()}`);
        console.error(`   → Run: cd svrn_engine && yarn run init-mxe`);
        return;
    }
    console.log(`✅ Computation definition account exists (${compDefInfo.data.length} bytes)`);
    console.log(`   Address: ${compDefAccount.toString()}`);
    // Verify cluster account exists
    const clusterInfo = await connection.getAccountInfo(clusterPda);
    if (!clusterInfo) {
        console.error(`❌ Cluster account not found: ${clusterPda.toString()}`);
        console.error(`   → Cluster offset ${clusterOffset} might be wrong. Check your arcium deploy command.`);
        return;
    }
    console.log(`✅ Cluster account exists (offset: ${clusterOffset})`);
    console.log(`   Address: ${clusterPda.toString()}`);
    // Find the starting computation offset ONCE (first non-existent account)
    // NOTE: Offsets 0-3 are broken, offset 4 may be occupied from previous runs
    // findNextComputationId now starts from 5 to avoid these issues
    const startingOffset = await findNextComputationId(connection, clusterOffset);
    console.log(`\n📍 Starting computation offset: ${startingOffset.toString()}`);
    console.log(`   Processing ${allVotes.length} votes with sequential offsets...`);
    console.log(`   Note: Offsets 0-4 are skipped (0-3 broken, 4 may be occupied)`);
    for (let i = 0; i < allVotes.length; i++) {
        const voteAccount = allVotes[i];
        const ciphertext = Buffer.from(voteAccount.account.ciphertext);
        const pubkey = Buffer.from(voteAccount.account.pubkey);
        const nonce = voteAccount.account.nonce;
        console.log(`\n   📄 Processing Ballot #${i + 1}...`);
        try {
            // Use sequential offsets: startingOffset + i (each vote gets unique offset)
            const compOffset = new anchor_1.BN(startingOffset.toNumber() + i);
            const compPda = (0, client_2.getComputationAccAddress)(clusterOffset, compOffset);
            console.log(`      > Using cluster offset: ${clusterOffset}, computation offset: ${compOffset.toString()}`);
            console.log(`      > Computation PDA: ${compPda.toString()}`);
            // A. SEND TO ARCIUM
            // The ciphertext from Arcium encryption is an array of arrays (one per input)
            // Each encrypted value is 32 bytes. We need to extract the two values.
            const ciphertextArray = Array.from(ciphertext);
            const ciphertext0 = new Array(32).fill(0);
            const ciphertext1 = new Array(32).fill(0);
            // Copy first 32 bytes to ciphertext0 (first encrypted input: balance)
            for (let j = 0; j < Math.min(32, ciphertextArray.length); j++) {
                ciphertext0[j] = ciphertextArray[j];
            }
            // Copy next 32 bytes to ciphertext1 (second encrypted input: choice)
            for (let j = 0; j < Math.min(32, ciphertextArray.length - 32); j++) {
                ciphertext1[j] = ciphertextArray[j + 32];
            }
            // Use the stored pubkey and nonce from the vote
            const pubkeyArray = Array.from(pubkey);
            const nonceBN = new anchor_1.BN(nonce.toString());
            const tx = await arciumProgram.methods
                .addTogether(compOffset, ciphertext0, ciphertext1, pubkeyArray, nonceBN)
                .accountsPartial({
                payer: wallet.publicKey,
                computationAccount: compPda,
                clusterAccount: clusterPda,
                mxeAccount: mxeAccount,
                mempoolAccount: mempoolAccount,
                executingPool: executingPool,
                compDefAccount: compDefAccount,
            })
                .signers([keypair])
                .rpc();
            console.log(`      > ✅ Tx Sent (Comp Offset: ${compOffset.toString()})`);
            console.log(`      > Transaction: ${tx}`);
            // B. MANUAL WAIT (No SDK Errors)
            const resultData = await waitForComputation(connection, compPda);
            // C. DECODE
            // Read u64 at offset 8 (Skip 8 byte discriminator)
            const power = resultData.readBigUInt64LE(8);
            const powerNum = Number(power);
            console.log(`      > Decrypted Weight: ${powerNum} (Linear: 1 credit = 1 vote)`);
            totalYesPower += powerNum;
        }
        catch (e) {
            console.error(`      > Error: ${e.message}`);
            if (e.logs) {
                console.error(`      > Logs:`, e.logs);
            }
            if (e.message?.includes("InvalidComputationOffset")) {
                console.error(`      > InvalidComputationOffset - Check cluster offset (${clusterOffset}) matches arcium deploy`);
            }
        }
    }
    // 5. FINAL REVEAL
    console.log("\n=================================");
    console.log("ELECTION RESULTS FINALIZED");
    console.log("=================================");
    console.log(`   TOTAL YES POWER: ${totalYesPower}`);
    console.log("=================================");
    // THE ENGINE TRIGGER
    // If YES power exists, we execute the on-chain settlement
    if (totalYesPower > 0) {
        console.log("\nWINNING THRESHOLD REACHED. TRIGGERING SETTLEMENT...");
        try {
            // Reconstruct Proposal PDA
            const [proposalPda] = web3_js_2.PublicKey.findProgramAddressSync([Buffer.from("svrn_v5"), new anchor_1.BN(1).toArrayLike(Buffer, "le", 8)], // Assuming ID 1 for tally
            SOLVOTE_ID);
            const tx = await solanaProgram.methods
                .finalizeExecution()
                .accounts({
                proposal: proposalPda,
                authority: wallet.publicKey,
            })
                .rpc();
            console.log(`ON-CHAIN EXECUTION FINALIZED! TX: ${tx}`);
            // Read back the payload to show what was decided
            const propAcc = await solanaProgram.account.proposal.fetch(proposalPda);
            const payload = Buffer.from(propAcc.executionPayload).toString();
            console.log(`PROCESSED ACTION: ${payload}`);
        }
        catch (e) {
            console.error("Execution Trigger Failed:", e.message);
        }
    }
}
main();
