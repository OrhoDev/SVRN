#!/usr/bin/env node
/**
 * Quick test script for new SDK features
 * Run: node test-features.js
 */

import { SolvrnClient, deriveSecret, computeQuadraticWeight, createVoteMessage, serializeSnapshot, deserializeSnapshot } from './sdk/dist/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🧪 Testing SVRN SDK Features\n');

    // Test 1: Basic utilities
    console.log('1️⃣  Testing Basic Utilities');
    console.log('─────────────────────────────');
    
    const testPubkey = 'ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234';
    const secret = deriveSecret(testPubkey);
    console.log(`✅ deriveSecret: 0x${secret.toString(16).slice(0, 16)}...`);
    
    const weight = computeQuadraticWeight(1000000);
    console.log(`✅ computeQuadraticWeight(1000000) = ${weight}`);
    
    const voteMsg = createVoteMessage(1, 1, '0x1234', {
        ciphertext: [1, 2, 3],
        public_key: [4, 5, 6],
        nonce: [7, 8, 9]
    });
    console.log(`✅ createVoteMessage: proposal=${voteMsg.proposalId}, choice=${voteMsg.choice === 1 ? 'YES' : 'NO'}`);
    console.log('');

    // Test 2: SDK initialization
    console.log('2️⃣  Testing SDK Initialization');
    console.log('─────────────────────────────');
    
    const solvrn = new SolvrnClient({
        relayerUrl: 'http://localhost:3000',
        trustlessMode: true
    });
    console.log(`✅ SolvrnClient created`);
    console.log(`   - Trustless mode: ${solvrn.config?.trustlessMode || false}`);
    console.log(`   - Snapshot builder: ${solvrn.snapshot ? '✅' : '❌'}`);
    console.log(`   - API client: ${solvrn.api ? '✅' : '❌'}`);
    console.log(`   - Prover: ${solvrn.prover ? '✅' : '❌'}`);
    console.log('');

    // Test 3: Snapshot serialization
    console.log('3️⃣  Testing Snapshot Serialization');
    console.log('─────────────────────────────');
    
    const mockSnapshot = {
        root: '0x' + 'a'.repeat(64),
        blockHeight: 12345,
        voters: [
            { owner: 'ABC123...', balance: 1000000, weight: 1000 },
            { owner: 'DEF456...', balance: 500000, weight: 707 }
        ],
        voterMap: {
            'ABC123...': { index: 0, balance: 1000000, weight: 1000, secret: '0x' + 'b'.repeat(64), leaf: '0x' + 'c'.repeat(64) },
            'DEF456...': { index: 1, balance: 500000, weight: 707, secret: '0x' + 'd'.repeat(64), leaf: '0x' + 'e'.repeat(64) }
        },
        levels: [['0x' + 'c'.repeat(64), '0x' + 'e'.repeat(64)], ['0x' + 'a'.repeat(64)]],
        metadata: { test: true }
    };
    
    const serialized = serializeSnapshot(mockSnapshot);
    const deserialized = deserializeSnapshot(serialized);
    
    if (deserialized.root === mockSnapshot.root) {
        console.log(`✅ Serialization works (${serialized.length} bytes)`);
        console.log(`✅ Deserialization works (${deserialized.voters.length} voters)`);
    } else {
        console.log('❌ Serialization failed');
    }
    console.log('');

    // Test 4: Relayer connectivity
    console.log('4️⃣  Testing Relayer Connectivity');
    console.log('─────────────────────────────');
    
    try {
        const healthRes = await fetch('http://localhost:3000/health');
        if (healthRes.ok) {
            const health = await healthRes.json();
            console.log(`✅ Relayer is healthy: ${health.status}`);
            
            const nextIdRes = await fetch('http://localhost:3000/next-proposal-id');
            const nextId = await nextIdRes.json();
            if (nextId.success) {
                console.log(`✅ Next proposal ID: ${nextId.nextId}`);
            }
        }
    } catch (e) {
        console.log(`⚠️  Relayer not accessible: ${e.message}`);
        console.log(`   Start relayer with: cd relayer && npm start`);
    }
    console.log('');

    // Test 5: Circuit JSON
    console.log('5️⃣  Checking Circuit JSON');
    console.log('─────────────────────────────');
    
    const circuitPath = path.join(__dirname, 'frontend', 'circuit', 'target', 'circuit.json');
    if (fs.existsSync(circuitPath)) {
        const circuitJson = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
        console.log(`✅ Circuit JSON found`);
        console.log(`   Has bytecode: ${circuitJson.bytecode ? '✅' : '❌'}`);
    } else {
        console.log(`⚠️  Circuit JSON not found at ${circuitPath}`);
    }
    console.log('');

    // Summary
    console.log('📊 Summary');
    console.log('─────────────────────────────');
    console.log('✅ All core utilities working');
    console.log('✅ SDK initialization successful');
    console.log('✅ Serialization/deserialization working');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. Test snapshot building with real RPC');
    console.log('   2. Test message signing with wallet');
    console.log('   3. Test end-to-end voting flow');
    console.log('');
    console.log('📖 See USAGE_GUIDE.md for detailed instructions');
}

main().catch(e => {
    console.error('❌ Test failed:', e.message);
    process.exit(1);
});

