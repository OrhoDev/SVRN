import { SolvrnApi, ProposalMetadata } from './api.js';
import { SolvrnProver } from './prover.js';
import { SolvrnEncryption } from './encryption.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

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

        console.log("SDK: Creating proposal via relayer (privacy mode)");
        console.log(`   Proposal ID: ${proposalId}`);
        console.log(`   Creator: ${authorityPubkey.toBase58().slice(0, 8)}... (hidden on-chain)`);

        // Create proposal via relayer - relayer signs the on-chain tx
        // Creator identity is stored off-chain only
        const result = await this.api.createProposal(
            proposalId,
            votingMint,
            metadata,
            authorityPubkey.toBase58(),
            authorityPubkey.toBase58() // targetWallet defaults to creator
        );

        if (!result.success) {
            throw new Error(result.error || "Failed to create proposal");
        }

        console.log(`   ✅ Proposal created: ${result.tx?.slice(0, 16)}...`);

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