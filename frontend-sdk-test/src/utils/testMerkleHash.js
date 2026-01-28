/**
 * Test script to verify Pedersen hash works
 * Run in browser console or create a test page
 */

import { pedersenHash } from './merkleTree.js';

// Test 1: Simple hash
async function testHash() {
    console.log("Testing Pedersen hash...");
    
    try {
        // Test with known values
        const hash1 = await pedersenHash("4", "8");
        console.log("✅ Hash(4, 8) =", hash1);
        
        // Test with zero
        const hash2 = await pedersenHash("0", "0");
        console.log("✅ Hash(0, 0) =", hash2);
        
        // Test with larger values
        const hash3 = await pedersenHash("12345", "67890");
        console.log("✅ Hash(12345, 67890) =", hash3);
        
        return true;
    } catch (err) {
        console.error("❌ Hash test failed:", err);
        return false;
    }
}

// Test 2: Verify consistency
async function testConsistency() {
    console.log("\nTesting hash consistency...");
    
    try {
        const hash1 = await pedersenHash("100", "200");
        const hash2 = await pedersenHash("100", "200");
        
        if (hash1 === hash2) {
            console.log("✅ Hash is deterministic:", hash1);
            return true;
        } else {
            console.error("❌ Hash is not deterministic!");
            return false;
        }
    } catch (err) {
        console.error("❌ Consistency test failed:", err);
        return false;
    }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
    window.testMerkleHash = async () => {
        const test1 = await testHash();
        const test2 = await testConsistency();
        return test1 && test2;
    };
}

export { testHash, testConsistency };

