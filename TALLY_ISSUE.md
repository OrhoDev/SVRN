# Critical Issue: Tally Functionality

## The Problem

**Users CAN call tally, BUT:**

### What Works:
✅ `api.proveTally()` - **REAL** ZK proof generation
✅ `api.getVoteCounts()` - **EXPOSED** in SDK

### What's Broken:
❌ `getVoteCounts()` returns **FAKED** vote counts:
- If no votes exist: Returns hardcoded `yesVotes: 6, noVotes: 4`
- If votes exist: Calls `decryptVotes()` which **randomly generates** yes/no (60% yes, 40% no)

### The Issue:
Users can generate **REAL ZK tally proofs**, but they're proving **FAKE vote counts**.

## Flow:

1. User calls `svrn.api.getVoteCounts(proposalId)`
   - Returns: `{ yesVotes: 6, noVotes: 4 }` (FAKED)

2. User calls `svrn.api.proveTally(proposalId, 6, 4, 51, 10)`
   - Generates: **REAL ZK proof** ✅
   - But proving: **FAKE vote counts** ❌

## Impact:

- ✅ Tally proof generation works (real ZK proofs)
- ❌ Vote counts are fake (simulated/random)
- ⚠️ Users can generate valid proofs of invalid data

## Solution Options:

1. **Remove `getVoteCounts()` from SDK** - Force users to provide their own counts
2. **Document the limitation** - Warn users that vote counts are simulated
3. **Fix vote decryption** - Implement real Arcium MPC decryption (relayer-side)

## Current Status:

**DO NOT PUBLISH** until this is resolved or clearly documented.

