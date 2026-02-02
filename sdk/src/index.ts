import { SolvrnApi, ProposalMetadata } from './api.js';
import { SolvrnProver } from './prover.js';
import { SolvrnEncryption } from './encryption.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import idl from './idl.json' with { type: 'json' };
import { hexToBytes } from './utils.js';

let PROGRAM_ID: PublicKey | null = null;

const getProgramId = (): PublicKey => {
    if (PROGRAM_ID) return PROGRAM_ID;
    
    const id = (globalThis as any).process?.env?.PROGRAM_ID || 
              process.env.PROGRAM_ID;
    
    if (!id) {
        throw new Error("PROGRAM_ID environment variable required. Please set process.env.PROGRAM_ID in your application or pass programId to SolvrnClient constructor.");
    }
    
    PROGRAM_ID = new PublicKey(id);
    return PROGRAM_ID;
};
// LEGACY TOKEN PROGRAM
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export class SolvrnClient {
    public api: SolvrnApi;
    public prover: SolvrnProver;
    public encryption: SolvrnEncryption;

    constructor(relayerUrl: string, arciumProgramId?: string, programId?: string) {
        // Allow programId to be passed in constructor for flexibility
        if (programId) {
            (globalThis as any).process = (globalThis as any).process || {};
            (globalThis as any).process.env = (globalThis as any).process.env || {};
            (globalThis as any).process.env.PROGRAM_ID = programId;
        }
        
        this.api = new SolvrnApi(relayerUrl);
        this.prover = new SolvrnProver();
        this.encryption = new SolvrnEncryption(arciumProgramId);
    }

    public async init(circuitJson: any) {
        await this.prover.init(circuitJson);
    }

  /**
     * Create a proposal with privacy-preserving mode.
     * The proposal is created via the relayer - creator identity is NOT stored on-chain.
     * 
     * @param provider - AnchorProvider (still needed for connection info)
     * @param authorityPubkey - Creator's public key (stored off-chain only)
     * @param votingMint - Token mint for voting eligibility
     * @param metadata - Proposal title, description, duration
     * @param gasBufferSol - (deprecated, relayer pays gas now)
     * @param proposalIdOverride - Optional specific proposal ID
     */
    public async createProposal(
        provider: AnchorProvider,
        authorityPubkey: PublicKey,
        votingMint: string,
        metadata: ProposalMetadata,
        gasBufferSol: number,
        proposalIdOverride?: number
    ) {
        let proposalId = proposalIdOverride;
        if (!proposalId) {
             const { nextId, success } = await this.api.getNextProposalId();
             if (!success) throw new Error("Failed to get ID");
             proposalId = nextId;
        }

        // Use relayer's /create-proposal endpoint (relayer signs and pays)
        const result = await this.api.createProposal(
            proposalId,
            votingMint,
            metadata,
            authorityPubkey.toBase58(),
            authorityPubkey.toBase58() // targetWallet
        );
        
        if (!result.success) {
            throw new Error(result.error || "Proposal creation failed");
        }

        return { proposalId, txid: result.tx };
    }

    public async castVote(
        provider: AnchorProvider,
        walletPubkey: string,
        proposalId: number,
        choice: number
    ) {
        // Input validation
        if (!walletPubkey || typeof walletPubkey !== 'string') {
            throw new Error("Invalid wallet public key");
        }
        if (!Number.isInteger(proposalId) || proposalId < 0) {
            throw new Error("Invalid proposal ID");
        }
        if (!Number.isInteger(choice) || (choice !== 0 && choice !== 1)) {
            throw new Error("Invalid vote choice: must be 0 (NO) or 1 (YES)");
        }

        const proofData = await this.api.getProof(proposalId, walletPubkey);
        const relayerSecret = proofData.proof.secret;
        const zkProof = await this.prover.generateVoteProof(relayerSecret, proofData, proposalId);

        const weight = Number(proofData.proof.weight);
        const encrypted = await this.encryption.encryptVote(provider, choice, weight);
        const nullifier = zkProof.publicInputs[zkProof.publicInputs.length - 1];
        
        const relayResponse = await this.api.submitVote(proposalId, nullifier, encrypted);
        return { success: relayResponse.success, tx: relayResponse.tx, error: relayResponse.error };
    }
}