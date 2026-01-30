import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const LEGACY_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

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
    // Matches Relayer 'deriveSecret' logic
    const buffer = new TextEncoder().encode(walletPubkey);
    let hash = 0n;
    const MOD = BigInt("0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    for (const byte of buffer) {
        hash = (hash << 8n) + BigInt(byte);
        hash = hash % MOD;
    }
    return "0x" + hash.toString(16);
}

export async function getVotingPower(connection: Connection, walletPubkey: PublicKey, votingMint: PublicKey): Promise<number> {
    try {
        if (!votingMint || votingMint.equals(SYSTEM_PROGRAM_ID)) {
            const lamports = await connection.getBalance(walletPubkey);
            return Math.floor(lamports / LAMPORTS_PER_SOL);
        }
        
        // STRICT LEGACY CHECK
        const tokenAccount = await getAssociatedTokenAddress(
            votingMint, 
            walletPubkey, 
            false, 
            LEGACY_TOKEN_PROGRAM_ID
        );
        const accountInfo = await getAccount(connection, tokenAccount, "confirmed", LEGACY_TOKEN_PROGRAM_ID);
        return Number(accountInfo.amount);
    } catch (e) {
        return 0;
    }
}