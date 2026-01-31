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

export class SvrnApi {
    constructor(private baseUrl: string) {}

    // --- UPDATED: Accepts Creator Argument ---
    async initializeSnapshot(proposalId: number, votingMint: string, metadata?: ProposalMetadata, creator?: string) {
        console.log("SDK SENDING:", { proposalId, votingMint, creator });
        return this.post('initialize-snapshot', { 
            proposalId, 
            votingMint,
            metadata,
            creator // <--- THIS MUST BE SENT TO THE RELAYER
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

    private async post(endpoint: string, body: any) {
        const res = await fetch(`${this.baseUrl}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    }

    private async get(endpoint: string) {
        const res = await fetch(`${this.baseUrl}/${endpoint}`);
        return await res.json();
    }
}