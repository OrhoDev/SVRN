# @svrn/sdk

**SVRN SDK** — Stripe for Web3 Voting

A TypeScript SDK for building private, encrypted voting applications on Solana using zero-knowledge proofs and confidential computing.

## Installation

```bash
npm install @svrn/sdk
```

## Quick Start

```typescript
import { SvrnClient } from '@svrn/sdk';

// Initialize the client
const svrn = new SvrnClient('http://localhost:3000', 'https://api.devnet.solana.com');

// Initialize ZK backend (must be called once)
await svrn.init(circuitJson); // Pass compiled Noir circuit JSON

// Create a proposal snapshot
await svrn.createProposal(proposalId, votingMint);

// Vote (full flow)
const result = await svrn.vote(wallet, proposalId, choice);
console.log('Vote submitted:', result.tx);

// Or break it down into steps:
const { proofData, weight, secret } = await svrn.getProof(proposalId, wallet.publicKey.toBase58());
const zkProof = await svrn.generateProof(secret, proofData, proposalId);
const encrypted = await svrn.encryptVote(wallet, choice, Number(weight));
await svrn.api.submitVote(proposalId, zkProof, encrypted);

// Finalize voting with ZK tally proof
const tallyProof = await svrn.proveTally(yesVotes, noVotes, threshold, quorum);
```

## API

### `SvrnClient`

#### Constructor
```typescript
constructor(relayerUrl: string, rpcUrl: string)
```

#### Methods

- **`init(circuitJson: any): Promise<void>`** — Initialize ZK backend
- **`createProposal(proposalId: number, votingMint: string): Promise<SnapshotResponse>`** — Create voting snapshot
- **`getProof(proposalId: number, pubkey: string): Promise<{ proofData, weight, secret }>`** — Get Merkle proof
- **`generateProof(secret, proofData, proposalId): Promise<VoteProof>`** — Generate ZK proof
- **`encryptVote(wallet, choice, weight): Promise<EncryptedVote>`** — Encrypt vote
- **`vote(wallet, proposalId, choice): Promise<SubmitVoteResponse>`** — Full voting flow
- **`proveTally(yesVotes, noVotes, threshold, quorum): Promise<TallyProofResponse>`** — Finalize with ZK proof

## Types

All TypeScript types are exported from `@svrn/sdk/dist/types`.

## Requirements

- Relayer running at `relayerUrl`
- Compiled Noir circuit JSON (from `frontend/circuit/` or `tally/`)
- Solana wallet connected to `rpcUrl`

## How It Works

1. **Snapshot** — SDK fetches all token holders of a mint and builds a Merkle tree
2. **Proof** — Returns a Merkle proof + voter secret for generating ZK proof
3. **ZK Proof** — SDK generates a zero-knowledge proof proving voter eligibility without revealing identity
4. **Encryption** — Vote choice is encrypted using Arcium MPC
5. **Submission** — Encrypted vote + ZK proof sent to relayer, which submits to on-chain program
6. **Tally** — ZK proof verifies vote counts meet quorum & majority thresholds
7. **Execution** — If vote passes, treasury funds transfer to target wallet

## License

ISC
