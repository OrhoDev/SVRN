# Merkle Tree Implementation Research & Plan

## Current Status
- ✅ Circuit verifies Merkle proofs correctly
- ✅ Demo mode works (bypasses when root is zero)
- ⚠️ Need real Pedersen hash computation in JavaScript

## Research Findings

### Reference Implementation
**GitHub: zk-scaling-group5/merkle-tree-noir**
- Multiple approaches: merkletreenoir, merkletreenoir2, merkletreerust
- Demonstrates Pedersen hash Merkle trees in Noir
- Good reference for structure and patterns

### Barretenberg Capabilities
**@aztec/bb.js** provides:
- Pedersen commitments and hashing
- Elliptic curve operations
- Works in browser via WASM
- Compatible with Noir's `std::hash::pedersen_hash`

### Implementation Approaches

#### Option 1: Use Barretenberg WASM Directly (Recommended)
- Use `@aztec/bb.js` to compute Pedersen hashes
- Build tree in JavaScript/TypeScript
- Store root on-chain when initializing proposal
- **Pros**: Full control, works in browser
- **Cons**: Need to find correct API

#### Option 2: Server-Side Computation
- Build Merkle tree on backend (Node.js)
- Use Barretenberg native bindings
- Return root + proofs to frontend
- **Pros**: More reliable, better performance
- **Cons**: Requires backend service

#### Option 3: Pre-compute with Noir Circuit
- Create minimal Noir circuit that just computes hashes
- Use it to build tree incrementally
- **Pros**: 100% compatibility
- **Cons**: Complex, slower

## Recommended Approach: Barretenberg WASM ✅

### Implementation Steps

1. **✅ Found Barretenberg Pedersen Hash API**
   ```typescript
   import { Barretenberg, BarretenbergSync } from '@aztec/bb.js';
   import { Fr } from '@aztec/bb.js/src/barretenberg/testing/fields';
   
   // Async version
   const api = await Barretenberg.new();
   const result = await api.pedersenHash({ 
       inputs: [new Fr(4n).toBuffer(), new Fr(8n).toBuffer()], 
       hashIndex: 0 
   });
   const hash = Fr.fromBuffer(result.hash);
   
   // Sync version (faster for bulk operations)
   const syncApi = await BarretenbergSync.initSingleton();
   const result2 = syncApi.pedersenHash({ 
       inputs: [new Fr(4n).toBuffer(), new Fr(8n).toBuffer()], 
       hashIndex: 0 
   });
   ```
   
   **Key Points:**
   - `inputs`: Array of Buffers (32 bytes each, Field elements)
   - `hashIndex`: Integer (0 is standard, 7 is also used)
   - Returns: `{ hash: Buffer }` (32 bytes)
   - Use `Fr` class to convert BigInt ↔ Buffer

2. **Build Merkle Tree Builder**
   - Function: `buildEligibilityTree(eligibleVoters)`
   - Compute leaves: `pedersen_hash(user_secret, balance)`
   - Build tree bottom-up using Pedersen hash
   - Return: `{ root, tree, leaves }`

3. **Generate Merkle Proofs**
   - Function: `generateMerkleProof(userSecret, balance, treeData, index)`
   - Find leaf in tree
   - Collect sibling hashes at each level
   - Return: `{ path, index, root }`

4. **Integration**
   - Update `getMerkleProof` to use real tree builder
   - Compute root when initializing proposal
   - Store root on-chain
   - Use stored root for verification

### Testing Strategy

1. **Unit Test Hash Function**
   - Compute known hash in Noir circuit
   - Compute same hash in JS using Barretenberg
   - Verify they match

2. **Test Tree Building**
   - Build tree with 2-3 test voters
   - Verify root computation
   - Generate proof for one voter
   - Verify proof in circuit

3. **End-to-End Test**
   - Initialize proposal with real root
   - Vote with real Merkle proof
   - Verify circuit accepts it

## Next Steps

1. Research Barretenberg API for Pedersen hash
2. Implement hash function wrapper
3. Build tree construction logic
4. Test with small tree (2-4 voters)
5. Integrate with proposal initialization
6. Remove demo mode bypass

## Files to Update

- `frontend/src/utils/merkleTree.js` - Main implementation
- `frontend/src/App.jsx` - Compute root when creating proposal
- `frontend/circuit/src/main.nr` - Remove demo mode (optional)

## Resources

- Reference: https://github.com/zk-scaling-group5/merkle-tree-noir
- Barretenberg Docs: https://barretenberg.aztec.network/docs/
- Noir Tutorial: https://noir-lang.org/docs/tutorials/noirjs_app

