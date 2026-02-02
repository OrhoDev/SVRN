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
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';

// Initialize the client
const solvrn = new SolvrnClient(
  'http://localhost:3000',  // Relayer URL
  'DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS',  // Arcium Program ID (optional)
  'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv'   // Solvrn Program ID (optional)
);

// Initialize ZK backend (must be called once)
await solvrn.init(circuitJson); // Pass compiled Noir circuit JSON

// Create a proposal
const { proposalId, txid } = await solvrn.createProposal(
  provider,      // AnchorProvider
  authority,     // PublicKey
  votingMint,    // Token mint address
  metadata,      // { title, desc, duration }
  gasBufferSol  // SOL amount for gas (e.g., 0.05)
);

// Cast a vote (full flow)
const result = await solvrn.castVote(
  provider,      // AnchorProvider
  walletPubkey,  // string (base58)
  proposalId,    // number
  choice         // 0 = NO, 1 = YES
);

console.log('Vote submitted:', result.tx);
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

#### Methods

- **`init(circuitJson: any): Promise<void>`** — Initialize ZK backend with Noir circuit
- **`createProposal(provider, authority, votingMint, metadata, gasBufferSol, proposalIdOverride?): Promise<{proposalId, txid}>`** — Create voting proposal and snapshot
- **`castVote(provider, walletPubkey, proposalId, choice): Promise<{success, tx, error}>`** — Full voting flow (proof + encryption + submission)
- **`api.getNextProposalId(): Promise<{nextId, success}>`** — Get next available proposal ID
- **`api.initializeSnapshot(proposalId, votingMint, metadata, creator): Promise<SnapshotResponse>`** — Initialize voting snapshot
- **`api.getProposal(proposalId): Promise<ProposalResponse>`** — Get proposal data
- **`api.getProof(proposalId, userPubkey): Promise<ProofResponse>`** — Get Merkle proof for voter
- **`api.submitVote(proposalId, nullifier, encryptedBallot): Promise<SubmitVoteResponse>`** — Submit encrypted vote
- **`api.getVoteCounts(proposalId): Promise<VoteCountsResponse>`** — Get vote counts
- **`api.proveTally(proposalId, yesVotes, noVotes, threshold, quorum): Promise<TallyProofResponse>`** — Generate ZK tally proof

### Sub-modules

- **`prover.generateVoteProof(secret, proofData, proposalId)`** — Generate ZK proof of eligibility
- **`encryption.encryptVote(provider, voteChoice, votingWeight)`** — Encrypt vote using Arcium MPC

## Requirements

- Relayer running at `relayerUrl` (see [Solvrn Relayer](https://github.com/solvrn-labs/solvrn-relayer))
- Compiled Noir circuit JSON (from `frontend/circuit/target/circuit.json`)
- Solana wallet connected via AnchorProvider

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
