import { hexToBytes } from './utils.js';

export interface ProofResponse {
    proof: {
        path: string[];
        index: number;
        root: string;
        balance: string;
        weight: string;
        secret: string;
        leaf: string;
    };
    success: boolean;
    error?: string;
}

export interface ProposalMetadata {
    title: string;
    desc: string;
    duration: number; // in hours
}

export interface ProposalSummary {
    proposalId: number;
    root: string;
    voterCount: number;
    metadata: ProposalMetadata;
    createdAt: number | null;
}

export interface EligibleProposal extends ProposalSummary {
    weight: number;
    balance: number;
}

export class SolvrnApi {
    constructor(private baseUrl: string, private apiKey: string) {}

    // --- UPDATED: Accepts Creator Argument ---
    async initializeSnapshot(proposalId: number, votingMint: string, metadata?: ProposalMetadata, creator?: string) {
        return this.post('initialize-snapshot', { 
            proposalId, 
            votingMint,
            metadata,
            creator
        });
    }

    async getNextProposalId(): Promise<{ nextId: number; success: boolean; }> {
        return this.get('next-proposal-id');
    }

    async getProposal(proposalId: number) {
        return this.get(`proposal/${proposalId}`);
    }

    async getProof(proposalId: number, userPubkey: string): Promise<ProofResponse> {
        const res = await this.post('get-proof', { proposalId: proposalId.toString(), userPubkey });
        
        if (!res.success) throw new Error(res.error || "Failed to fetch merkle proof");
        return res;
    }

    async submitVote(
        proposalId: number, 
        nullifierHex: string, 
        encryptedBallot: { ciphertext: Uint8Array, public_key: number[], nonce: number[] }
    ) {
        return this.post('relay-vote', {
            nullifier: hexToBytes(nullifierHex),
            ciphertext: Array.from(encryptedBallot.ciphertext),
            pubkey: encryptedBallot.public_key,
            nonce: encryptedBallot.nonce,
            proposalId
        });
    }

    async proveTally(proposalId: number, yesVotes: number, noVotes: number, threshold: number, quorum: number) {
        return this.post('prove-tally', { proposalId, yesVotes, noVotes, threshold, quorum });
    }

    async getVoteCounts(proposalId: number) {
        return this.get(`vote-counts/${proposalId}`);
    }

    // ==========================================
    // PROPOSAL DISCOVERY (New SDK Feature)
    // ==========================================

    /**
     * Get all proposals from the relayer.
     * Returns proposal IDs, metadata, voter counts, and roots.
     */
    async getAllProposals(): Promise<{ 
        success: boolean; 
        proposals: ProposalSummary[]; 
        count: number; 
        error?: string 
    }> {
        return this.get('proposals');
    }

    /**
     * Get active (non-executed) proposals.
     * Checks on-chain status to filter out executed proposals.
     */
    async getActiveProposals(): Promise<{ 
        success: boolean; 
        proposals: ProposalSummary[]; 
        count: number; 
        error?: string 
    }> {
        return this.get('proposals/active');
    }

    /**
     * Get proposals by voting mint address.
     * Useful for DAOs that want to show only their token's proposals.
     */
    async getProposalsByMint(mint: string): Promise<{ 
        success: boolean; 
        proposals: ProposalSummary[]; 
        count: number; 
        error?: string 
    }> {
        return this.get(`proposals/by-mint/${mint}`);
    }

    /**
     * Get proposals where a wallet is eligible to vote.
     * Returns proposals where the wallet is in the voter snapshot.
     */
    async getEligibleProposals(wallet: string): Promise<{ 
        success: boolean; 
        proposals: EligibleProposal[]; 
        count: number; 
        error?: string 
    }> {
        return this.get(`proposals/eligible/${wallet}`);
    }

    /**
     * Check if a wallet can vote on a specific proposal.
     * Returns eligibility status and voting weight.
     */
    async checkEligibility(proposalId: number, wallet: string): Promise<{
        eligible: boolean;
        weight?: number;
        balance?: number;
        error?: string;
    }> {
        try {
            const proof = await this.getProof(proposalId, wallet);
            return {
                eligible: true,
                weight: Number(proof.proof.weight),
                balance: Number(proof.proof.balance)
            };
        } catch (e: any) {
            return { eligible: false, error: e.message };
        }
    }

    // --- PRIVACY-PRESERVING PROPOSAL CREATION ---
    // Creates proposal via relayer (creator identity hidden on-chain)
    async createProposal(
        proposalId: number,
        votingMint: string,
        metadata: ProposalMetadata,
        creator: string,
        targetWallet?: string
    ): Promise<{ success: boolean; tx?: string; proposalId?: string; root?: string; voterCount?: number; error?: string }> {
        return this.post('create-proposal', {
            proposalId,
            votingMint,
            metadata,
            creator,
            targetWallet
        });
    }

    private async post(endpoint: string, body: any) {
        // SECURITY: Validate endpoint to prevent demo/admin access
        const allowedEndpoints = [
            'initialize-snapshot',
            'get-proof', 
            'relay-vote',
            'prove-tally',
            'create-proposal'
        ];
        
        if (!allowedEndpoints.includes(endpoint)) {
            throw new Error(`Endpoint '${endpoint}' is not accessible through SDK. Use direct API calls for admin functionality.`);
        }
        
        const res = await fetch(`${this.baseUrl}/${endpoint}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey  // Baked-in authentication
            },
            body: JSON.stringify(body)
        });
        return await res.json();
    }

    private async get(endpoint: string) {
        // SECURITY: Validate endpoint to prevent demo/admin access
        const allowedEndpoints = [
            'next-proposal-id',
            'proposal',
            'vote-counts',
            'proposals',
            'proposals/active',
            'proposals/by-mint',
            'proposals/eligible'
        ];
        
        // Check if endpoint matches any allowed pattern
        const isAllowed = allowedEndpoints.some(allowed => 
            endpoint === allowed || endpoint.startsWith(`${allowed}/`)
        );
        
        if (!isAllowed) {
            throw new Error(`Endpoint '${endpoint}' is not accessible through SDK. Use direct API calls for admin functionality.`);
        }
        
        const res = await fetch(`${this.baseUrl}/${endpoint}`, {
            headers: {
                'X-API-Key': this.apiKey  // Baked-in authentication
            }
        });
        return await res.json();
    }
}