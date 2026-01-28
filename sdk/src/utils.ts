import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

export const hexToBytes = (hex: string): number[] => {
    let cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (cleanHex.length % 2 !== 0) cleanHex = "0" + cleanHex;
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    return bytes;
};

export const toHex = (val: string | number | bigint): string => {
    let hex = typeof val === 'string' ? val.replace('0x', '') : BigInt(val).toString(16);
    return "0x" + hex.padStart(64, '0');
};

export async function getWalletSecret(walletPubkey: string, proposalId: number | string): Promise<string> {
    // Derive secret from pubkey + proposalId (no wallet signing required)
    const message = new TextEncoder().encode(`SVRN_SECRET_${walletPubkey}_P${proposalId}`);
    const hash = await crypto.subtle.digest('SHA-256', message);
    const hashArray = Array.from(new Uint8Array(hash)).slice(0, 31);
    return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getVotingPower(connection: Connection, walletPubkey: PublicKey, votingMint: PublicKey): Promise<number> {
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