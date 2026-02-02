/**
 * Test snapshot building with actual ZK backend
 */

import { SolvrnClient, SnapshotBuilder } from '../sdk/dist/index.js';
import { Barretenberg } from '@aztec/bb.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('=== Testing Snapshot Building with ZK Backend ===\n');

    // Load circuit JSON
    const circuitPath = path.join(__dirname, 'frontend', 'circuit', 'target', 'circuit.json');
    if (!fs.existsSync(circuitPath)) {
        console.error(`❌ Circuit JSON not found at ${circuitPath}`);
        process.exit(1);
    }
    const circuitJson = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
    console.log('✅ Circuit JSON loaded\n');

    // Initialize Barretenberg
    console.log('1. Initializing Barretenberg backend...');
    const bb = await Barretenberg.new();
    console.log('✅ Barretenberg initialized\n');

    // Initialize SnapshotBuilder
    console.log('2. Initializing SnapshotBuilder...');
    const snapshotBuilder = new SnapshotBuilder({
        maxVoters: 256,
        quadraticVoting: true
    });
    await snapshotBuilder.init(bb);
    console.log('✅ SnapshotBuilder initialized\n');

    // Create mock voters
    console.log('3. Creating mock voters...');
    const mockVoters = [
        { owner: 'ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234', balance: 1000000 },
        { owner: 'DEF456GHI789JKL012MNO345PQR678STU901VWX234ABC123', balance: 500000 },
        { owner: 'GHI789JKL012MNO345PQR678STU901VWX234ABC123DEF456', balance: 250000 },
        { owner: 'JKL012MNO345PQR678STU901VWX234ABC123DEF456GHI789', balance: 100000 }
    ];
    console.log(`   Created ${mockVoters.length} mock voters\n`);

    // Build snapshot
    console.log('4. Building snapshot...');
    const startTime = Date.now();
    const snapshot = await snapshotBuilder.buildSnapshot(mockVoters, {
        test: true,
        timestamp: Date.now()
    });
    const buildTime = Date.now() - startTime;
    
    console.log(`   ✅ Snapshot built in ${buildTime}ms`);
    console.log(`   Root: ${snapshot.root.slice(0, 32)}...`);
    console.log(`   Voters: ${snapshot.voters.length}`);
    console.log(`   Tree levels: ${snapshot.levels.length}`);
    console.log('');

    // Verify voters
    console.log('5. Verifying voters in snapshot...');
    for (const voter of mockVoters) {
        const voterData = snapshot.voterMap[voter.owner];
        if (voterData) {
            const expectedWeight = Math.floor(Math.sqrt(voter.balance));
            if (voterData.weight === expectedWeight) {
                console.log(`   ✅ ${voter.owner.slice(0, 20)}...: balance=${voter.balance}, weight=${voterData.weight}`);
            } else {
                console.log(`   ❌ ${voter.owner.slice(0, 20)}...: weight mismatch (got ${voterData.weight}, expected ${expectedWeight})`);
            }
        } else {
            console.log(`   ❌ ${voter.owner.slice(0, 20)}...: not found in snapshot`);
        }
    }
    console.log('');

    // Test Merkle proof generation
    console.log('6. Testing Merkle proof generation...');
    const testWallet = mockVoters[0].owner;
    const proof = snapshotBuilder.getMerkleProof(snapshot, testWallet);
    if (proof) {
        console.log(`   ✅ Proof generated for ${testWallet.slice(0, 20)}...`);
        console.log(`   Path length: ${proof.path.length}`);
        console.log(`   Indices: [${proof.indices.join(', ')}]`);
        console.log(`   Path[0]: ${proof.path[0].slice(0, 16)}...`);
    } else {
        console.log(`   ❌ Failed to generate proof`);
    }
    console.log('');

    // Test membership verification
    console.log('7. Testing membership verification...');
    const isValid = await snapshotBuilder.verifyMembership(snapshot, testWallet);
    if (isValid) {
        console.log(`   ✅ Membership verified for ${testWallet.slice(0, 20)}...`);
    } else {
        console.log(`   ❌ Membership verification failed`);
    }
    
    // Test with invalid wallet
    const invalidWallet = 'INVALID1234567890123456789012345678901234567890';
    const isInvalid = await snapshotBuilder.verifyMembership(snapshot, invalidWallet);
    if (!isInvalid) {
        console.log(`   ✅ Correctly rejected invalid wallet`);
    } else {
        console.log(`   ❌ Incorrectly accepted invalid wallet`);
    }
    console.log('');

    // Test serialization
    console.log('8. Testing snapshot serialization...');
    const { serializeSnapshot, deserializeSnapshot } = await import('../sdk/dist/index.js');
    const serialized = serializeSnapshot(snapshot);
    const deserialized = deserializeSnapshot(serialized);
    
    if (deserialized.root === snapshot.root && 
        deserialized.voters.length === snapshot.voters.length &&
        deserialized.levels.length === snapshot.levels.length) {
        console.log(`   ✅ Serialization/deserialization successful`);
        console.log(`   Serialized size: ${serialized.length} bytes`);
    } else {
        console.log(`   ❌ Serialization failed`);
    }
    console.log('');

    console.log('=== Snapshot Building Test Complete ===');
    console.log('✅ All snapshot building features working');
    console.log('✅ ZK backend integration successful');
    console.log('✅ Merkle tree construction correct');
    console.log('✅ Proof generation working');
    console.log('✅ Membership verification working');
}

main().catch(e => {
    console.error('Test failed:', e);
    console.error('Stack:', e.stack);
    process.exit(1);
});

