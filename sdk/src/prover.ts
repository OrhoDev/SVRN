import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import { toHex } from './utils.js';

export class SolvrnProver {
    private backend: UltraHonkBackend | null = null;
    private noir: Noir | null = null;
    private initialized: boolean = false;

    /**
     * Check if the prover is initialized and ready.
     */
    isInitialized(): boolean {
        return this.initialized && this.noir !== null && this.backend !== null;
    }

    async init(circuitJson: any) {
        // 1. Initialize the Barretenberg WASM module first
        const bb = await Barretenberg.new();
        
        // 2. Constructor signature changed in v3 - use type assertion
        // @ts-ignore - v3 types don't match but runtime works
        this.backend = new UltraHonkBackend(circuitJson.bytecode, bb);
        
        this.noir = new Noir(circuitJson);
        this.initialized = true;
    }

    async generateVoteProof(secret: string, proofRes: any, proposalId: number) {
        console.log("=== ZK PROOF GENERATION START ===");
        console.log("PROOF RES:", JSON.stringify(proofRes, null, 2));
        
        if (!this.noir || !this.backend) throw new Error("Prover not initialized. Call init() first.");

        const weightVal = BigInt(proofRes.proof.weight);
        const balanceVal = BigInt(proofRes.proof.balance);

        console.log("=== INPUT ANALYSIS ===");
        console.log("weightVal:", weightVal.toString(), `(${weightVal.toString()} decimal)`);
        console.log("balanceVal:", balanceVal.toString(), `(${balanceVal.toString()} decimal)`);
        console.log("weight²:", (weightVal * weightVal).toString());
        console.log("weight² <= balance:", (weightVal * weightVal) <= balanceVal ? "PASS" : "FAIL");
        console.log("merkle_index:", proofRes.proof.index);
        console.log("merkle_root:", proofRes.proof.root);
        console.log("merkle_path length:", proofRes.proof.path.length);
        console.log("merkle_path[0]:", proofRes.proof.path[0]);

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

        console.log('=== NOIR INPUTS ===');
        console.log('Noir inputs:', JSON.stringify(inputs, null, 2));

        try {
            console.log("=== EXECUTING NOIR CIRCUIT ===");
            const { witness } = await this.noir.execute(inputs);
            console.log("=== NOIR EXECUTION SUCCESS ===");
            
            console.log("=== GENERATING ZK PROOF ===");
            const proof = await this.backend.generateProof(witness);
            console.log("=== ZK PROOF GENERATION SUCCESS ===");
            
            return proof;
        } catch (error: any) {
            console.log("=== ZK PROOF GENERATION FAILED ===");
            console.log("Error:", error.message);
            console.log("Error details:", error);
            throw error;
        }
    }
}