# Merkle Tree Implementation Plan

## ✅ Research Complete

**Found Barretenberg API:**
- `api.pedersenHash({ inputs: [Buffer, Buffer], hashIndex: 0 })`
- Returns `{ hash: Buffer }` (32 bytes)
- Use `Fr` class for Field ↔ Buffer conversion

## Implementation Strategy

### Phase 1: Hash Function Wrapper
Create a simple wrapper that:
1. Converts Field strings (from Noir) to Buffers
2. Calls Barretenberg's `pedersenHash`
3. Converts result back to Field string

### Phase 2: Tree Builder
Build Merkle tree:
1. Compute leaves: `pedersen_hash(user_secret, balance)` for each voter
2. Build tree bottom-up using `pedersen_hash(left, right)`
3. Return root + tree structure

### Phase 3: Proof Generator
Generate Merkle proofs:
1. Find leaf index in tree
2. Collect sibling hashes at each level
3. Return path array

### Phase 4: Integration
1. Compute root when initializing proposal
2. Store root on-chain
3. Use stored root for verification
4. Remove demo mode bypass

## Next: Start Implementation

Ready to build! 🚀

