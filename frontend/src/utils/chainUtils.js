import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { getMerkleProof as generateMerkleProofFromTree, buildEligibilityTree } from './merkleTree.js';

/**
 * 1. Fetch Voting Power from SPL Token Account
 * Returns the balance from the specified voting_mint token account.
 * Falls back to native SOL if voting_mint is SystemProgram.
 */
export async function getVotingPower(connection, walletPubkey, votingMint) {
    try {
        // If voting_mint is SystemProgram (native SOL), use balance check
        const systemProgramId = new PublicKey("11111111111111111111111111111111");
        if (votingMint && votingMint.equals(systemProgramId)) {
            const lamports = await connection.getBalance(walletPubkey);
            const credits = Math.floor(lamports / LAMPORTS_PER_SOL);
            return credits;
        }
        
        // Otherwise, fetch SPL token balance
        if (votingMint) {
            const tokenAccount = await getAssociatedTokenAddress(
                votingMint,
                walletPubkey
            );
            const accountInfo = await getAccount(connection, tokenAccount);
            return Number(accountInfo.amount);
        }
        
        // Fallback to SOL
        const lamports = await connection.getBalance(walletPubkey);
        return Math.floor(lamports / LAMPORTS_PER_SOL);
    } catch (e) {
        console.warn("Failed to fetch voting power", e);
        // Fallback to SOL balance
        try {
            const lamports = await connection.getBalance(walletPubkey);
            return Math.floor(lamports / LAMPORTS_PER_SOL);
        } catch (e2) {
            return 0;
        }
    }
}

/**
 * 2. Generate Real Merkle Proof
 * Builds tree and generates proof.
 * 
 * NOTE: For demo, builds tree with single voter.
 * In production, would use full eligibility snapshot.
 * 
 * @param {string} userSecret - User's secret (as Field string)
 * @param {number} balance - User's balance
 * @param {string} storedRoot - Merkle root from proposal (for verification)
 * @returns {Promise<{path: string[], index: number, root: string}>}
 */
export async function getMerkleProof(userSecret, balance, storedRoot = "0") {
    // For demo: Build tree with just this voter
    // In production: Use full eligibility list from snapshot
    const eligibleVoters = [{ userSecret, balance }];
    
    // Build tree and generate proof
    const proof = await generateMerkleProofFromTree(userSecret, balance, eligibleVoters, 0);
    
    // If storedRoot is provided and non-zero, use it (for verification)
    // Otherwise use computed root
    if (storedRoot !== "0" && storedRoot !== "0") {
        proof.root = storedRoot;
    }
    
    return proof;
}

/**
 * 3. Derive Deterministic Secret
 * Signs a message to generate a unique secret for ZK Nullifiers.
 */
export async function getWalletSecret(wallet, proposalId) {
    if (!wallet.signMessage) throw new Error("Wallet does not support signing");

    const message = new TextEncoder().encode(
        `Sign this message to access your privacy voting credentials.\n\nContext: SolVote\nProposal: ${proposalId}`
    );

    const signature = await wallet.signMessage(message);
    
    // Hash signature to fit in Field
    const hash = await crypto.subtle.digest('SHA-256', signature);
    const hashArray = Array.from(new Uint8Array(hash)).slice(0, 31);
    
    const secretInt = BigInt('0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join(''));
    return secretInt.toString();
}
