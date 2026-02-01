import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import { toHex } from './utils.js';

export class SolvrnProver {
    private backend: UltraHonkBackend | null = null;
    private noir: Noir | null = null;

    async init(circuitJson: any) {
        // 1. Initialize the Barretenberg WASM module first
        const bb = await Barretenberg.new();
        
        // 2. Use single argument constructor for v2.1.11
        this.backend = new UltraHonkBackend(circuitJson.bytecode, bb);
        
        this.noir = new Noir(circuitJson);
    }

    async generateVoteProof(secret: string, proofRes: any, proposalId: number) {
        if (!this.noir || !this.backend) throw new Error("Prover not initialized. Call init() first.");

        const weightVal = BigInt(proofRes.proof.weight);
        const balanceVal = BigInt(proofRes.proof.balance);

        // Use EXACT formatting from old working code (no padding on merkle_path/merkle_root)
        const inputs = {
            user_secret: "0x" + secret.replace('0x', '').padStart(64, '0'), 
            balance: "0x" + balanceVal.toString(16).padStart(64, '0'),
            weight: "0x" + weightVal.toString(16).padStart(64, '0'),
            merkle_path: proofRes.proof.path,  // Pass as-is, no padding
            merkle_index: Number(proofRes.proof.index),
            merkle_root: proofRes.proof.root,  // Pass as-is, no padding
            proposal_id: "0x" + BigInt(proposalId).toString(16).padStart(64, '0')
        };

        console.log('Noir inputs:', JSON.stringify(inputs, null, 2));

        const { witness } = await this.noir.execute(inputs);
        const proof = await this.backend.generateProof(witness);
        
        return proof;
    }
}