import { SolvrnClient } from './sdk/dist/index.js';
import { readFileSync } from 'fs';

async function testWorkingCircuit() {
    console.log('🧪 Testing with working circuit from Feb 4th 22:25...');
    
    const svrn = new SolvrnClient('http://localhost:3000');
    
    try {
        // Initialize the prover with working circuit
        console.log('🔧 Initializing prover with working circuit...');
        const circuitJson = JSON.parse(readFileSync('./frontend/circuit/target/circuit.json', 'utf8'));
        console.log('Circuit size:', JSON.stringify(circuitJson).length, 'bytes');
        await svrn.prover.init(circuitJson);
        
        // Get proof for proposal 11111
        const proofResult = await svrn.api.getProof(11111, 'E7V1eAqAou9fhk2tUC8gDBGgsYQYvCW83nobJhbjDMfW');
        
        console.log('✅ Got proof:', {
            success: proofResult.success,
            root: proofResult.proof?.root?.slice(0, 16) + '...',
            index: proofResult.proof?.index
        });
        
        if (proofResult.success) {
            console.log('🚀 Attempting ZK proof generation...');
            
            const zkProof = await svrn.prover.generateVoteProof(proofResult.proof.secret, proofResult, 11111);
            
            console.log('🎉 SUCCESS! ZK proof generated:', {
                hasProof: !!zkProof,
                proofLength: zkProof ? zkProof.length : 0
            });
            
            return true;
        } else {
            console.log('❌ Failed to get proof');
            return false;
        }
    } catch (error) {
        console.error('❌ Test Failed:', error.message);
        return false;
    }
}

testWorkingCircuit().then(success => {
    console.log(success ? '✅ Working circuit SUCCESS!' : '❌ Working circuit FAILED');
    process.exit(success ? 0 : 1);
});
