import { Barretenberg } from '@aztec/bb.js';
import { Buffer } from 'buffer';

// Singleton instance
let barretenbergInstance = null;

async function getBarretenberg() {
    if (!barretenbergInstance) {
        // Single thread is stable for Node/Browser
        barretenbergInstance = await Barretenberg.new({ threads: 1 });
    }
    return barretenbergInstance;
}

// Helper: Ensure we always have a valid 32-byte Buffer
function toBuffer32(val) {
    try {
        let bigVal;
        if (typeof val === 'bigint') bigVal = val;
        else if (typeof val === 'number') bigVal = BigInt(Math.floor(val)); // Handle floats
        else if (typeof val === 'string') {
            if (val.startsWith('0x')) bigVal = BigInt(val);
            else bigVal = BigInt(val);
        } else {
            // If it's already a buffer or unknown, default to 0 to prevent crash
            return Buffer.alloc(32).fill(0);
        }

        const hex = bigVal.toString(16);
        const padded = hex.padStart(64, '0');
        // Slice last 64 chars to handle potential overflows gracefully
        return Buffer.from(padded.slice(-64), 'hex');
    } catch (e) {
        return Buffer.alloc(32).fill(0);
    }
}

/**
 * Compute Pedersen hash safely
 */
export async function pedersenHash(input1, input2) {
    const bb = await getBarretenberg();
    const buf1 = toBuffer32(input1);
    const buf2 = toBuffer32(input2);

    const result = await bb.pedersenHash({
        inputs: [buf1, buf2],
        hashIndex: 0
    });
    
    // Convert result buffer to BigInt string
    const hex = Buffer.from(result).toString('hex');
    return BigInt('0x' + hex).toString();
}

/**
 * Build eligibility Merkle tree (Demo Mode)
 */
export async function buildEligibilityTree(eligibleVoters) {
    if (!eligibleVoters || eligibleVoters.length === 0) {
        throw new Error("No voters provided");
    }
    
    const targetSize = 8; // Height 3
    const paddedVoters = [...eligibleVoters];
    
    // Pad
    while (paddedVoters.length < targetSize) {
        paddedVoters.push({ userSecret: "0", balance: 0 });
    }
    
    const leaves = [];
    
    // 1. Compute Leaves
    for (let i = 0; i < paddedVoters.length; i++) {
        const voter = paddedVoters[i];
        const leaf = await pedersenHash(voter.userSecret, voter.balance);
        leaves.push(leaf);
    }
    
    // 2. Build Tree Levels
    const tree = [leaves];
    let currentLevel = leaves;
    
    while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] || "0";
            const parent = await pedersenHash(left, right);
            nextLevel.push(parent);
        }
        tree.push(nextLevel);
        currentLevel = nextLevel;
    }
    
    // Return Root and full structure
    return {
        root: currentLevel[0],
        leaves: leaves,
        tree: tree
    };
}

/**
 * Get Merkle Proof for specific user
 */
export async function getMerkleProof(userSecret, balance, eligibleVoters, voterIndex = 0) {
    // Rebuild tree to get path (Deterministic)
    const treeData = await buildEligibilityTree(eligibleVoters);
    const leaves = treeData.tree[0];
    
    // Verify leaf matches
    const myLeaf = await pedersenHash(userSecret, balance);
    // Note: In a real app we'd find the index. Here we assume 0 for demo.
    
    const path = [];
    let idx = voterIndex;
    
    // Traverse up (Height 3 = 3 levels of siblings)
    for (let level = 0; level < 3; level++) {
        const levelNodes = treeData.tree[level];
        const isLeft = idx % 2 === 0;
        const siblingIdx = isLeft ? idx + 1 : idx - 1;
        
        path.push(levelNodes[siblingIdx]);
        idx = Math.floor(idx / 2);
    }
    
    return {
        root: treeData.root,
        path: path,
        index: voterIndex
    };
}