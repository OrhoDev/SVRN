import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

/**
 * 1. Local Balance Check
 */
export async function getVotingPower(connection, walletPubkey, votingMint) {
    try {
        if (!votingMint || votingMint.equals(SYSTEM_PROGRAM_ID)) {
            const lamports = await connection.getBalance(walletPubkey);
            return Math.floor(lamports / LAMPORTS_PER_SOL);
        }
        const tokenAccount = await getAssociatedTokenAddress(votingMint, walletPubkey);
        const accountInfo = await getAccount(connection, tokenAccount);
        return Number(accountInfo.amount);
    } catch (e) {
        return 0;
    }
}

/**
 * 2. Identity Derivation
 */
export async function getWalletSecret(wallet, proposalId) {
    if (!wallet.signMessage) throw new Error("WALLET_CANNOT_SIGN");
    const message = new TextEncoder().encode(`SVRN_AUTH_P${proposalId}`);
    const signature = await wallet.signMessage(message);
    const hash = await crypto.subtle.digest('SHA-256', signature);
    const hashArray = Array.from(new Uint8Array(hash)).slice(0, 31);
    return BigInt('0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join(''));
}