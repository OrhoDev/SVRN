import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';

const PROGRAM_ID = new PublicKey("4Yg7QBY94QFH48C9z3114SidMKHqjT2xVMTFnM6fCo9Q");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

async function verifyVote(proposalId: number) {
    console.log(`\n🔍 Verifying Proposal #${proposalId}...\n`);
    
    // Load IDL
    const idl = JSON.parse(fs.readFileSync('./idl.json', 'utf-8'));
    
    // Derive proposal PDA
    const [proposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("proposal"), new BN(proposalId).toArrayLike(Buffer, "le", 8)],
        PROGRAM_ID
    );
    
    console.log("📍 Proposal PDA:", proposalPda.toBase58());
    
    // Fetch proposal account
    const accountInfo = await connection.getAccountInfo(proposalPda);
    if (!accountInfo) {
        console.log("❌ Proposal account not found");
        return;
    }
    
    console.log(`✅ Account exists (${accountInfo.data.length} bytes)`);
    
    // Try to deserialize with IDL
    try {
        const provider = new AnchorProvider(connection, { publicKey: PublicKey.default } as any, {});
        const program = new Program(idl, provider) as any;
        const proposal = await program.account.proposal.fetch(proposalPda);
        
        console.log("\n📊 Proposal Data:");
        console.log("   Proposal ID:", proposal.proposalId.toString());
        console.log("   Vote Count:", proposal.voteCount.toString());
        console.log("   Authority:", proposal.authority.toBase58());
        console.log("   Voting Mint:", proposal.votingMint.toBase58());
        
        // Check Merkle Root
        const merkleRootBytes = Buffer.from(proposal.merkleRoot as number[]);
        const merkleRootHex = merkleRootBytes.toString('hex');
        const merkleRootBigInt = merkleRootBytes.readBigUInt64LE(0);
        const isZeroRoot = merkleRootBytes.every(b => b === 0);
        
        console.log("\n🌳 Merkle Root Status:");
        console.log("   Raw Bytes:", merkleRootHex);
        console.log("   As BigInt:", merkleRootBigInt.toString());
        console.log("   Is Zero:", isZeroRoot);
        
        if (isZeroRoot) {
            console.log("   ⚠️  DEMO MODE: Merkle verification was SKIPPED");
            console.log("   ℹ️  Circuit bypassed Merkle check (merkle_root == 0)");
        } else {
            console.log("   ✅ REAL MODE: Merkle verification was REQUIRED");
            console.log("   ℹ️  Circuit verified Merkle inclusion proof");
        }
        
        // Check for nullifier accounts (votes)
        console.log("\n🔐 Checking Nullifier Accounts...");
        const nullifierAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
            filters: [
                { dataSize: 8 + 32 + 32 + 4 + 200 + 32 + 16 }, // NullifierAccount size
                { memcmp: { offset: 8, bytes: proposalPda.toBase58() } } // proposal field
            ]
        });
        
        console.log(`   Found ${nullifierAccounts.length} nullifier account(s)`);
        if (nullifierAccounts.length > 0) {
            console.log("   ✅ Votes recorded on-chain!");
            nullifierAccounts.forEach((acc, i) => {
                console.log(`   Vote ${i + 1}: ${acc.pubkey.toBase58()}`);
            });
        } else {
            console.log("   ⚠️  No nullifier accounts found");
        }
        
    } catch (e: any) {
        console.log("\n⚠️  Could not deserialize (legacy structure?)");
        console.log("   Error:", e.message);
        
        // Try raw read
        if (accountInfo.data.length >= 24) {
            const voteCountBytes = accountInfo.data.slice(16, 24);
            const voteCount = new BN(voteCountBytes, 'le', 8);
            console.log(`\n📊 Raw Data Read:`);
            console.log("   Vote Count:", voteCount.toNumber());
            
            // Check if it has merkle_root (new structure = 120 bytes, old = 88 bytes)
            if (accountInfo.data.length >= 120) {
                const merkleRootBytes = accountInfo.data.slice(88, 120);
                const isZeroRoot = merkleRootBytes.every(b => b === 0);
                console.log("   Merkle Root (raw):", merkleRootBytes.toString('hex'));
                console.log("   Is Zero:", isZeroRoot);
                if (isZeroRoot) {
                    console.log("   ⚠️  DEMO MODE: Merkle verification was SKIPPED");
                }
            } else {
                console.log("   ⚠️  Legacy proposal (no merkle_root field)");
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

