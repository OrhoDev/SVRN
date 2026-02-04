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
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_2 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const fs = __importStar(require("fs"));
const PROGRAM_ID = new web3_js_2.PublicKey("2BFMGPa8TvvLhyDhND8BXCDLwNibYapp1zsxBXrSrjDg");
// const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const connection = new web3_js_2.Connection("http://127.0.0.1:8899", "confirmed");
async function verifyVote(proposalId) {
    console.log(`\nVerifying Proposal #${proposalId}...\n`);
    // Load IDL
    const idl = JSON.parse(fs.readFileSync('./idl.json', 'utf-8'));
    // Derive proposal PDA
    const [proposalPda] = web3_js_2.PublicKey.findProgramAddressSync([Buffer.from("svrn_v5"), new anchor_1.BN(proposalId).toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
    console.log("Proposal PDA:", proposalPda.toBase58());
    // Fetch proposal account
    const accountInfo = await connection.getAccountInfo(proposalPda);
    if (!accountInfo) {
        console.log("Proposal account not found");
        return;
    }
    console.log(`Account exists (${accountInfo.data.length} bytes)`);
    // Try to deserialize with IDL
    try {
        const provider = new anchor_1.AnchorProvider(connection, { publicKey: web3_js_2.PublicKey.default }, {});
        const program = new anchor_1.Program(idl, provider);
        const proposal = await program.account.proposal.fetch(proposalPda);
        console.log("\nProposal Data:");
        console.log("   Proposal ID:", proposal.proposalId.toString());
        console.log("   Vote Count:", proposal.voteCount.toString());
        console.log("   Authority:", proposal.authority.toBase58());
        console.log("   Voting Mint:", proposal.votingMint.toBase58());
        // Check Merkle Root
        const merkleRootBytes = Buffer.from(proposal.merkleRoot);
        const merkleRootHex = merkleRootBytes.toString('hex');
        const merkleRootBigInt = merkleRootBytes.readBigUInt64LE(0);
        const isZeroRoot = merkleRootBytes.every(b => b === 0);
        console.log("\nMerkle Root Status:");
        console.log("   Raw Bytes:", merkleRootHex);
        console.log("   As BigInt:", merkleRootBigInt.toString());
        console.log("   Is Zero:", isZeroRoot);
        if (isZeroRoot) {
            console.log("   DEMO MODE: Merkle verification was SKIPPED");
            console.log("   Circuit bypassed Merkle check (merkle_root == 0)");
        }
        else {
            console.log("   REAL MODE: Merkle verification was REQUIRED");
            console.log("   Circuit verified Merkle inclusion proof");
        }
        // Check for nullifier accounts (votes)
        console.log("\nChecking Nullifier Accounts...");
        const nullifierAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
            filters: [
                { dataSize: 8 + 32 + 32 + 4 + 200 + 32 + 16 }, // NullifierAccount size
                { memcmp: { offset: 8, bytes: proposalPda.toBase58() } } // proposal field
            ]
        });
        console.log(`   Found ${nullifierAccounts.length} nullifier account(s)`);
        if (nullifierAccounts.length > 0) {
            console.log("   Votes recorded on-chain!");
            nullifierAccounts.forEach((acc, i) => {
                console.log(`   Vote ${i + 1}: ${acc.pubkey.toBase58()}`);
            });
        }
        else {
            console.log("   No nullifier accounts found");
        }
    }
    catch (e) {
        console.log("\nCould not deserialize (legacy structure?)");
        console.log("   Error:", e.message);
        // Try raw read
        if (accountInfo.data.length >= 24) {
            const voteCountBytes = accountInfo.data.slice(16, 24);
            const voteCount = new anchor_1.BN(voteCountBytes, 'le');
            console.log(`\nRaw Data Read:`);
            console.log("   Vote Count:", voteCount.toNumber());
            // Check if it has merkle_root (new structure = 120 bytes, old = 88 bytes)
            if (accountInfo.data.length >= 120) {
                const merkleRootBytes = accountInfo.data.slice(88, 120);
                const isZeroRoot = merkleRootBytes.every(b => b === 0);
                console.log("   Merkle Root (raw):", merkleRootBytes.toString('hex'));
                console.log("   Is Zero:", isZeroRoot);
                if (isZeroRoot) {
                    console.log("   DEMO MODE: Merkle verification was SKIPPED");
                }
            }
            else {
                console.log("   Legacy proposal (no merkle_root field)");
            }
        }
    }
    console.log("\n" + "=".repeat(60));
    console.log("Summary:");
    console.log("  - If Merkle Root is zero: Demo mode (verification skipped)");
    console.log("  - If Merkle Root is non-zero: Real mode (verification required)");
    console.log("  - Vote count should match number of nullifier accounts");
    console.log("=".repeat(60) + "\n");
}
// Run
const proposalId = process.argv[2] ? parseInt(process.argv[2]) : 29;
verifyVote(proposalId).catch(console.error);
