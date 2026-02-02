# Solvrn SDK - What It Actually Does

## The SDK is the Product

The frontend is just a demo. The SDK is what developers actually use.

## Core Capabilities

### 1. **Privacy-Preserving Proposal Creation**
```typescript
const { proposalId, txid } = await svrn.createProposal(
  provider, authority, votingMint, metadata, gasBuffer
);
```
- ✅ Creates proposals via relayer (creator identity hidden)
- ✅ Builds Merkle tree snapshot automatically
- ✅ Returns transaction signature for verification
- ✅ No wallet signature needed from user

### 2. **Zero-Knowledge Vote Casting**
```typescript
const result = await svrn.castVote(provider, wallet, proposalId, choice);
```
- ✅ Generates ZK proof client-side (Barretenberg WASM)
- ✅ Encrypts vote using Arcium MPC
- ✅ Submits via relayer (gasless)
- ✅ Creates nullifier (prevents double-voting)
- ✅ No wallet signature needed

### 3. **ZK Proof Generation**
```typescript
const proof = await svrn.prover.generateVoteProof(secret, proofData, proposalId);
```
- ✅ Uses Barretenberg UltraHonk backend
- ✅ Compiles Noir circuits
- ✅ Generates proofs client-side
- ✅ Proves eligibility without revealing identity

### 4. **Vote Encryption**
```typescript
const encrypted = await svrn.encryption.encryptVote(provider, choice, weight);
```
- ✅ Uses Arcium threshold cryptography
- ✅ Ephemeral keys (no wallet signature)
- ✅ Client-side encryption
- ✅ Secure multi-party computation ready

### 5. **API Integration**
```typescript
svrn.api.getNextProposalId()      // Get next proposal ID
svrn.api.getProposal(id)           // Get proposal data
svrn.api.getProof(id, wallet)      // Get Merkle proof
svrn.api.getVoteCounts(id)         // Get vote counts
svrn.api.proveTally(...)            // Generate tally proof
```

## What Makes It Powerful

### ✅ **Complete Abstraction**
- Developers don't need to understand:
  - Merkle tree construction
  - ZK proof generation
  - Vote encryption
  - Transaction relaying
  - Privacy preservation

### ✅ **Privacy by Default**
- Creator identity hidden on-chain
- Voter identity hidden (ZK proofs)
- Votes encrypted end-to-end
- Gasless operations

### ✅ **Real Cryptography**
- **Barretenberg** - Industry-standard ZK backend
- **Noir** - Modern ZK circuit language
- **Arcium MPC** - Threshold cryptography
- **Merkle Trees** - Real on-chain snapshots
- **Nullifiers** - Real double-vote prevention

### ✅ **Production Ready**
- TypeScript types included
- Error handling built-in
- Transaction verification
- On-chain storage

## Usage Example

```typescript
import { SolvrnClient } from 'solvrn-sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

// Initialize
const svrn = new SolvrnClient(relayerUrl, arciumId, programId);
await svrn.init(circuitJson);

// Create proposal (3 lines)
const { proposalId } = await svrn.createProposal(
  provider, authority, votingMint, metadata, 0.05
);

// Cast vote (1 line)
await svrn.castVote(provider, wallet, proposalId, 1);

// That's it! Everything else is handled.
```

## What Developers Get

1. **3 lines of code** to create a private proposal
2. **1 line of code** to cast an encrypted vote
3. **Zero cryptography knowledge** required
4. **Zero gas costs** for users
5. **Complete privacy** out of the box

## Published on npm

```bash
npm install solvrn-sdk
```

Package: `solvrn-sdk@1.0.0`
Repository: https://github.com/svrn-labs/svrn-sdk

## The SDK Does Everything

- ✅ ZK proof generation
- ✅ Vote encryption
- ✅ Merkle proof fetching
- ✅ Transaction relaying
- ✅ Privacy preservation
- ✅ Gasless operations
- ✅ Error handling
- ✅ Type safety

**The frontend is just a UI wrapper around the SDK.**
