# solvrn-sdk

**Solvrn SDK** — Privacy SDK for Solana Governance

A TypeScript SDK for building private, encrypted voting applications on Solana using zero-knowledge proofs and confidential computing.

## Installation

```bash
npm install solvrn-sdk
```

## Quick Start

```typescript
import { SolvrnClient } from 'solvrn-sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

// Initialize the client
const solvrn = new SolvrnClient('https://your-relayer.com');

// Initialize ZK backend (circuit is bundled - no need to provide it!)
await solvrn.init();

// Discover proposals you can vote on
const { proposals } = await solvrn.api.getEligibleProposals(wallet.publicKey.toBase58());
console.log(`You can vote on ${proposals.length} proposals`);

// Create a proposal
const { proposalId } = await solvrn.createProposal(
  provider, authority, votingMint, 
  { title: "Fund Development", desc: "Allocate 5000 USDC", duration: 72 },
  0.05
);

// Cast a vote (SDK handles ZK proof + encryption + submission)
const result = await solvrn.castVote(provider, wallet, proposalId, 1); // 1 = YES
console.log('Vote submitted:', result.tx);
```

## What's New

**Proposal Discovery** — Find proposals without knowing IDs:
```typescript
// Get all proposals
const all = await solvrn.api.getAllProposals();

// Get active (not executed) proposals
const active = await solvrn.api.getActiveProposals();

// Get proposals for a specific token
const byMint = await solvrn.api.getProposalsByMint(mintAddress);

// Get proposals where a wallet can vote
const eligible = await solvrn.api.getEligibleProposals(walletAddress);

// Check if a wallet can vote on a specific proposal
const check = await solvrn.api.checkEligibility(proposalId, walletAddress);
if (check.eligible) {
  console.log(`Can vote with weight: ${check.weight}`);
}
```

**Bundled Circuit** — No need to provide circuit JSON:
```typescript
// Old way (still works)
await solvrn.init(myCircuitJson);

// New way (uses bundled circuit)
await solvrn.init();

// Check if ready
if (solvrn.isReady()) {
  console.log('SDK ready for voting');
}
```

## API

### `SolvrnClient`

#### Constructor
```typescript
constructor(
  relayerUrl: string, 
  arciumProgramId?: string, 
  programId?: string
)
```

#### Core Methods

- **`init(circuit?): Promise<void>`** — Initialize ZK backend (circuit is optional, bundled by default)
- **`isReady(): boolean`** — Check if SDK is initialized
- **`createProposal(...): Promise<{proposalId, txid}>`** — Create voting proposal
- **`castVote(...): Promise<{success, tx, error}>`** — Full voting flow (ZK proof + encryption + submission)

#### Proposal Discovery (NEW)

- **`api.getAllProposals(): Promise<{proposals, count}>`** — Get all proposals
- **`api.getActiveProposals(): Promise<{proposals, count}>`** — Get active (non-executed) proposals
- **`api.getProposalsByMint(mint): Promise<{proposals, count}>`** — Get proposals by voting token
- **`api.getEligibleProposals(wallet): Promise<{proposals, count}>`** — Get proposals where wallet can vote
- **`api.checkEligibility(proposalId, wallet): Promise<{eligible, weight, balance}>`** — Check voting eligibility

#### Other API Methods

- **`api.getNextProposalId(): Promise<{nextId}>`** — Get next proposal ID
- **`api.getProposal(proposalId): Promise<ProposalResponse>`** — Get proposal data
- **`api.getProof(proposalId, userPubkey): Promise<ProofResponse>`** — Get Merkle proof
- **`api.getVoteCounts(proposalId): Promise<VoteCountsResponse>`** — Get vote counts
- **`api.proveTally(...): Promise<TallyProofResponse>`** — Generate ZK tally proof

### Sub-modules

- **`prover.generateVoteProof(secret, proofData, proposalId)`** — Generate ZK eligibility proof
- **`encryption.encryptVote(provider, voteChoice, votingWeight)`** — Encrypt vote with Arcium MPC

## Requirements

- Relayer running at `relayerUrl`
- Solana wallet connected via AnchorProvider
- (Circuit JSON is now bundled — no longer required!)

## How It Works

1. **Snapshot** — Relayer fetches token holders and builds Merkle tree
2. **Proof** — SDK gets Merkle proof + voter secret from relayer
3. **ZK Proof** — SDK generates zero-knowledge proof proving eligibility
4. **Encryption** — Vote choice encrypted using Arcium MPC
5. **Submission** — Encrypted vote + ZK proof sent to relayer → Solana
6. **Tally** — Relayer decrypts votes and generates ZK tally proof
7. **Verification** — Tally proof verifies quorum & majority thresholds

## What's Real

**Real ZK Proofs** - Uses Barretenberg WASM + Noir circuits  
**Real Encryption** - Arcium MPC encryption  
**Real On-Chain** - Actual Solana transactions  
**Real Merkle Trees** - Built from actual token holders  
**Real Nullifiers** - Prevents double voting  
**Real Vote Storage** - Encrypted votes stored on-chain

## Current Limitations

**Vote Decryption** - Currently simulated (relayer-side). Real Arcium MPC decryption coming soon.  
**Vote Count Breakdown** - `getVoteCounts()` returns simulated yes/no breakdown. The total vote count (`realVoteCount`) is accurate.  
**Tally Proofs** - Work perfectly with user-provided vote counts. ZK proofs are 100% real.

## Important: Using Tally in Production

**CRITICAL:** `proveTally()` generates REAL ZK proofs, but if you use `getVoteCounts()` for vote counts, you'll be proving SIMULATED data.

### Full Flow (With Limitation):

```typescript
// 1. Create proposal (REAL)
const { proposalId } = await solvrn.createProposal(...);

// 2. Cast vote (REAL)
await solvrn.castVote(provider, wallet, proposalId, 1);

// 3. Get vote counts (PARTIALLY REAL)
const counts = await solvrn.api.getVoteCounts(proposalId);
// counts.realVoteCount - Accurate total
// counts.yesVotes/noVotes - Simulated breakdown

// 4. Prove tally (REAL PROOF, BUT PROVING SIMULATED DATA)
const tallyProof = await solvrn.api.proveTally(
  proposalId,
  counts.yesVotes,  // Simulated!
  counts.noVotes,   // Simulated!
  51, 10
);
// Returns: Real ZK proof
// But proving: Simulated vote counts
```

### Recommended: Provide Your Own Vote Counts

For production, decrypt votes yourself or wait for relayer decryption:

```typescript
// Get accurate total vote count
const counts = await solvrn.api.getVoteCounts(proposalId);
console.log(`Total votes: ${counts.realVoteCount}`); // Accurate

// Provide your own yes/no breakdown (from your own decryption)
const tallyProof = await solvrn.api.proveTally(
  proposalId,
  yourDecryptedYesVotes,  // Your own decryption
  yourDecryptedNoVotes,   // Your own decryption
  51, 10
);
// Returns: Real ZK proof of REAL data
```

**What's Real:**
- Total vote count (`realVoteCount`) - Accurate
- ZK proof generation - 100% real
- Vote encryption - 100% real
- On-chain storage - 100% real
- Tally proof generation - 100% real

**What's Simulated:**
- Yes/No breakdown from `getVoteCounts()` - Until Arcium MPC decryption is implemented  

## License

ISC
