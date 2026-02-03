# SOLVRN SDK

SOLVRN SDK is a TypeScript library for building private governance applications on Solana using zero-knowledge proofs and secure multi-party computation.

The SDK handles all cryptographic operations automatically while providing a clean interface for creating proposals, casting private votes, and generating verifiable proofs.

## Installation

```bash
npm install solvrn-sdk
```

## Quick Start

```typescript
import { SolvrnClient } from 'solvrn-sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

// Initialize with default relayer
const solvrn = new SolvrnClient();

// Or specify custom relayer
const solvrn = new SolvrnClient('https://your-relayer.com');

// Initialize ZK backend (circuit is bundled)
await solvrn.init();

// Create proposal
const { proposalId } = await solvrn.createProposal(
    provider, authority, votingMint, 
    { title: "Fund Development", desc: "Allocate 5000 USDC", duration: 72 },
    0.05
);

// Cast vote (SDK handles ZK proof + encryption + submission)
const result = await solvrn.castVote(
    provider,           // Solana wallet connection
    wallet.publicKey.toBase58(),  // Wallet address string
    proposalId,         // Proposal ID
    1                  // 0 = NO, 1 = YES
);
```

## Default Relayer

The SDK includes a default relayer for development testing. This allows you to start building immediately without hosting your own relayer.

For production deployments, run your own relayer instance to ensure availability and control over infrastructure.

## Core API

### Constructor

```typescript
constructor(
  relayerUrl?: string,           // Optional - uses default if not provided
  arciumProgramId?: string,     // Optional - uses default if not provided
  programId?: string            // Optional - uses default if not provided
)
```

### Methods

- **`init(circuit?): Promise<void>`** - Initialize ZK backend (circuit is optional, bundled by default)
- **`isReady(): boolean`** - Check if SDK is initialized
- **`createProposal(provider, authority, mint, metadata, fee): Promise<{proposalId, txid}>`** - Create voting proposal
- **`castVote(provider, walletPubkey, proposalId, choice): Promise<{success, tx, error}>`** - Full voting flow (ZK proof + encryption + submission)

### Proposal Discovery

- **`api.getAllProposals(): Promise<{proposals, count}>`** - Get all proposals
- **`api.getActiveProposals(): Promise<{proposals, count}>`** - Get active (non-executed) proposals
- **`api.getProposalsByMint(mint): Promise<{proposals, count}>`** - Get proposals by voting token
- **`api.getEligibleProposals(wallet): Promise<{proposals, count}>`** - Get proposals where wallet can vote
- **`api.checkEligibility(proposalId, wallet): Promise<{eligible, weight, balance}>`** - Check voting eligibility

### Additional API Methods

- **`api.getNextProposalId(): Promise<{nextId}>`** - Get next proposal ID
- **`api.getProposal(proposalId): Promise<ProposalResponse>`** - Get proposal data
- **`api.getProof(proposalId, userPubkey): Promise<ProofResponse>`** - Get Merkle proof
- **`api.getVoteCounts(proposalId): Promise<VoteCountsResponse>`** - Get vote counts
- **`api.proveTally(proposalId, yesVotes, noVotes, threshold, quorum): Promise<TallyProofResponse>`** - Generate ZK tally proof

## Architecture

The SDK orchestrates four key components to enable private voting:

1. **Snapshot Generation** - Relayer fetches token holders and builds Merkle tree
2. **Zero-Knowledge Proofs** - SDK generates Noir UltraHonk proofs proving eligibility without revealing identity
3. **Vote Encryption** - Vote choices encrypted using Arcium Threshold MPC
4. **On-Chain Storage** - Encrypted votes and ZK proofs stored on Solana with verification

## Technical Implementation

### Bundled Circuit

The SDK bundles a default Noir circuit for convenience. The circuit proves that a voter:
- Holds the required voting tokens
- Has not voted before (nullifier)
- Meets eligibility requirements

### Vote Encryption

Votes are encrypted using Arcium's Threshold MPC system, ensuring that:
- No single party can decrypt individual votes
- Vote aggregation is possible without revealing individual choices
- The relayer cannot access plaintext votes

### Tally Verification

The system generates zero-knowledge proofs that verify:
- Vote counts are accurate
- Quorum and threshold requirements are met
- All votes came from eligible token holders

## Production Considerations

### Vote Counting

The `getVoteCounts()` method returns the total vote count accurately, but the yes/no breakdown is currently simulated for development. For production use:

```typescript
// Get accurate total vote count
const counts = await solvrn.api.getVoteCounts(proposalId);
console.log(`Total votes: ${counts.realVoteCount}`); // Accurate

// Provide your own yes/no breakdown for tally proof
const tallyProof = await solvrn.api.proveTally(
    proposalId,
    yourDecryptedYesVotes,  // Your own decryption
    yourDecryptedNoVotes,   // Your own decryption
    51, 10
);
```

### Relayer Infrastructure

For production deployments:
- Run your own relayer instance
- Ensure high availability and monitoring
- Configure appropriate rate limiting
- Use secure key management

## Requirements

- Node.js 18 or higher
- Solana wallet connected via AnchorProvider
- (Relayer URL is optional - default provided)
- (Circuit JSON is bundled - no longer required)

## License

ISC
