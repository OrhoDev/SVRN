const { Connection, PublicKey } = require("@solana/web3.js");
const { getMint, getAssociatedTokenAddress, getAccount } = require("@solana/spl-token");

// --- CONFIG ---
const RPC_URL = "https://api.devnet.solana.com";
const MINT_ADDRESS = "DD641F4zVEsNkZGu6M22YLY2fvhwGaN6hrcGgMfw6i6k";
const MY_WALLET = "YOUR_WALLET_PUBLIC_KEY_HERE"; // Optional: Put your wallet here

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function diagnoseToken() {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(MINT_ADDRESS);

    console.log(`--- DIAGNOSING TOKEN: ${MINT_ADDRESS} ---`);

    // 1. Check Account Owner
    const info = await connection.getAccountInfo(mintPubkey);
    if (!info) {
        console.error("❌ ERROR: Mint not found on Devnet. Check your address.");
        return;
    }

    const owner = info.owner.toBase58();
    let programId = TOKEN_PROGRAM_ID;

    console.log(`\n[1] PROGRAM OWNER:`);
    if (owner === TOKEN_PROGRAM_ID.toBase58()) {
        console.log("✅ TYPE: LEGACY TOKEN (Tokenkeg...)");
        programId = TOKEN_PROGRAM_ID;
    } else if (owner === TOKEN_2022_PROGRAM_ID.toBase58()) {
        console.log("✅ TYPE: TOKEN-2022 (TokenzQd...)");
        programId = TOKEN_2022_PROGRAM_ID;
    } else {
        console.log(`❌ UNKNOWN OWNER: ${owner}`);
    }

    // 2. Fetch Mint Details
    try {
        const mintInfo = await getMint(connection, mintPubkey, "confirmed", programId);
        console.log(`\n[2] MINT DETAILS:`);
        console.log(`   - Decimals: ${mintInfo.decimals}`);
        console.log(`   - Supply:   ${mintInfo.supply.toString()}`);
        console.log(`   - Authority: ${mintInfo.mintAuthority?.toBase58() || "None"}`);
    } catch (e) {
        console.error("❌ Could not fetch mint details. Are you sure this is a Mint address and not an ATA?");
    }

    // 3. Check Wallet Balance (If provided)
    if (MY_WALLET !== "YOUR_WALLET_PUBLIC_KEY_HERE") {
        try {
            const walletPubkey = new PublicKey(MY_WALLET);
            const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey, false, programId);
            const account = await getAccount(connection, ata, "confirmed", programId);
            
            console.log(`\n[3] WALLET STATUS (${MY_WALLET.slice(0,6)}...):`);
            console.log(`   - ATA Address: ${ata.toBase58()}`);
            console.log(`   - Balance:     ${Number(account.amount) / Math.pow(10, 6)} tokens (raw: ${account.amount})`);
        } catch (e) {
            console.log(`\n[3] WALLET STATUS: No token account found for this wallet. User cannot vote.`);
        }
    }

    console.log("\n--- DIAGNOSIS COMPLETE ---");
}

diagnoseToken();