/**
 * Real Merkle Tree Builder for SVRN Eligibility Snapshots
 * 
 * Uses Barretenberg WASM to compute Pedersen hashes
 * compatible with Noir's std::hash::pedersen_hash
 * 
 * OPTIMIZATIONS:
 * 1. Parallel hashing using Promise.all
 * 2. Accepts existing Barretenberg instance to avoid WASM re-init
 */

import { Barretenberg } from '@aztec/bb.js';

// Field class helper (simplified version of Fr from Barretenberg)
class Field {
    constructor(value) {
        // Accept BigInt or string (Field as string)
        this.value = typeof value === 'bigint' ? value : BigInt(value);
        // Field modulus for BN254
        this.MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
        if (this.value >= this.MODULUS) {
            throw new Error(`Value exceeds field modulus`);
        }
    }

    toBuffer() {
        // Convert BigInt to 32-byte Buffer (big-endian)
        const buffer = Buffer.alloc(32);
        const hex = this.value.toString(16).padStart(64, '0');
        for (let i = 0; i < 32; i++) {
            const byteStr = hex.substring(i * 2, (i + 1) * 2);
            buffer[i] = parseInt(byteStr, 16);
        }
        return buffer;
    }

    toString() {
        return this.value.toString();
    }

    static fromBuffer(buffer) {
        // Convert 32-byte Buffer to BigInt
        const hex = Array.from(buffer)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return new Field(BigInt('0x' + hex));
    }
}

/**
 * Compute Pedersen hash using Barretenberg
 * Compatible with Noir's std::hash::pedersen_hash
 * 
 * @param {string|bigint} input1 - First Field value
 * @param {string|bigint} input2 - Second Field value
 * @param {Object} [bbInstance] - Optional initialized Barretenberg instance
 * @returns {Promise<string>} Hash result as Field string
 */
export async function pedersenHash(input1, input2, bbInstance) {
    // Use injected instance or fallback to creating a new one (slower)
    const bb = bbInstance || await Barretenberg.new();
    
    // Convert inputs to Field buffers
    const field1 = new Field(input1);
    const field2 = new Field(input2);
    
    // Call Barretenberg's pedersenHash
    const result = await bb.pedersenHash({
        inputs: [field1.toBuffer(), field2.toBuffer()],
        hashIndex: 0  // Standard hash index
    });
    
    // Convert result back to Field string
    const hashField = Field.fromBuffer(result.hash);
    return hashField.toString();
}

/**
 * Generate Merkle proof for a voter
 * 
 * @param {string} userSecret - User's secret (as Field string)
 * @param {number} balance - User's balance
 * @param {Object} treeData - Tree data from buildEligibilityTree
 * @param {number} voterIndex - Index of voter in eligibility list
 * @param {Object} [bbInstance] - Optional initialized Barretenberg instance
 * @returns {Promise<{path: string[], index: number, root: string}>}
 */
export async function generateMerkleProof(userSecret, balance, treeData, voterIndex, bbInstance) {
    const { tree, root, leafMap } = treeData;
    
    // Compute the leaf hash (same as in tree building)
    const balanceField = balance.toString();
    const leafHash = await pedersenHash(userSecret, balanceField, bbInstance);
    
    // Verify this leaf exists in the tree
    if (!leafMap.has(leafHash) && voterIndex < tree[0].length) {
        // Leaf should be at voterIndex
        const expectedLeaf = tree[0][voterIndex];
        if (expectedLeaf !== leafHash) {
            console.warn(`Leaf hash mismatch at index ${voterIndex}`);
        }
    }
    
    // Find leaf index in tree (handle padding)
    let leafIndex = voterIndex;
    
    // Build proof path (sibling hashes at each level)
    // Path goes from leaf to root, collecting siblings
    const path = [];
    let currentIndex = leafIndex;
    let level = 0;
    
    // For height-3 tree, we have 3 levels (leaves -> level1 -> level2 -> root)
    // We need siblings at each level
    while (level < tree.length - 1) {
        const currentLevel = tree[level];
        const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
        const sibling = currentLevel[siblingIndex] || "0";
        path.push(sibling);
        
        // Move up to parent level
        currentIndex = Math.floor(currentIndex / 2);
        level++;
    }
    
    // Ensure we have exactly 3 path elements (for height-3 tree)
    while (path.length < 3) {
        path.push("0");
    }
    
    return {
        path: path.slice(0, 3),
        index: voterIndex,
        root: root
    };
}

/**
 * Get Merkle proof for a voter
 * Builds tree and generates proof
 * 
 * @param {string} userSecret - User's secret (as Field string)
 * @param {number} balance - User's balance
 * @param {Array<{userSecret: string, balance: number}>} eligibleVoters - All eligible voters
 * @param {number} voterIndex - Index of voter in eligibility list
 * @param {Object} [bbInstance] - Optional initialized Barretenberg instance
 * @returns {Promise<{path: string[], index: number, root: string}>}
 */
export async function getMerkleProof(userSecret, balance, eligibleVoters, voterIndex = 0, bbInstance) {
    // Build tree with all eligible voters
    const treeData = await buildEligibilityTree(eligibleVoters, bbInstance);
    
    // Generate proof for this voter
    return generateMerkleProof(userSecret, balance, treeData, voterIndex, bbInstance);
}

/**
 * Build eligibility Merkle tree
 * 
 * @param {Array<{userSecret: string, balance: number}>} eligibleVoters - List of eligible voters
 * @param {Object} [bbInstance] - Optional initialized Barretenberg instance
 * @returns {Promise<{tree: Array, root: string, leaves: Array, leafMap: Map}>}
 */
export async function buildEligibilityTree(eligibleVoters, bbInstance) {
    if (eligibleVoters.length === 0) {
        throw new Error("Cannot build tree with no eligible voters");
    }

    const bb = bbInstance || await Barretenberg.new();
    
    // Tree height 3 supports up to 8 voters (2^3 = 8)
    // Pad to power of 2 if needed
    const targetSize = Math.pow(2, 3); // 8 leaves for height-3 tree
    const paddedVoters = [...eligibleVoters];
    
    // Pad with zeros if needed
    while (paddedVoters.length < targetSize) {
        paddedVoters.push({ userSecret: "0", balance: 0 });
    }
    
    // Step 1: Compute all leaves in PARALLEL
    // Leaf = pedersen_hash(user_secret, balance)
    console.log("Computing leaves...");
    
    const leafPromises = paddedVoters.map(voter => {
        const balanceField = voter.balance.toString();
        return pedersenHash(voter.userSecret, balanceField, bb);
    });

    const leaves = await Promise.all(leafPromises);
    
    // Reconstruct Map for O(1) lookups
    const leafMap = new Map(); 
    for (let i = 0; i < eligibleVoters.length; i++) {
        leafMap.set(leaves[i], i);
    }
    
    console.log(`✅ Computed ${leaves.length} leaves`);
    
    // Step 2: Build tree bottom-up
    // Level 0 = leaves, Level 1 = parents of leaves, etc.
    const tree = [leaves]; // Store all levels
    let currentLevel = leaves;
    
    while (currentLevel.length > 1) {
        const nextLevel = [];
        const pairPromises = [];

        // Batch hash calculations for this level
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] || "0"; // Pad with zero if odd
            // Parent = pedersen_hash(left, right)
            pairPromises.push(pedersenHash(left, right, bb));
        }

        const nextLevelNodes = await Promise.all(pairPromises);
        nextLevel.push(...nextLevelNodes);
        
        tree.push(nextLevel);
        currentLevel = nextLevel;
    }
    
    const root = currentLevel[0];
    console.log(`✅ Tree built. Root: ${root}`);
    
    return {
        tree,      // All levels: [leaves, level1, level2, root]
        root,      // Root hash
        leaves,    // Leaf hashes
        leafMap    // Map: leaf hash -> voter index
    };
}