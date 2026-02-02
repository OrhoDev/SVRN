# Solvrn

Solvrn is a private governance protocol for Solana that enables confidential on-chain voting using zero-knowledge proofs and secure multi-party computation.

The protocol addresses a core limitation of decentralized governance systems: the inability to preserve voter privacy while maintaining public verifiability. Solvrn allows participants to vote without revealing identity, voting power, or preferences, while still enforcing eligibility, preventing double voting, and producing a verifiable tally.

## Quick Start

```bash
npm install solvrn-sdk
```

```typescript
import { SolvrnClient } from 'solvrn-sdk';

const solvrn = new SolvrnClient('https://your-relayer.com');
await solvrn.init(circuitJson);

const { proposalId } = await solvrn.createProposal(provider, authority, mint, metadata, 0.05);
await solvrn.castVote(provider, wallet, proposalId, 1); // 1 = YES
```

## Overview

Solvrn combines zero-knowledge proofs for eligibility verification with MPC-based ballot encryption to ensure that voting remains private throughout its entire lifecycle. Votes are recorded on-chain only as encrypted ciphertexts, and results are revealed exclusively through zero-knowledge verified tallies.

The system is designed to support real-world governance use cases such as DAO voting, treasury management, and quadratic voting without leaking sensitive information.

## Architecture

Solvrn is composed of four primary components.

### 1. Solana Smart Contract

The on-chain program is responsible for proposal initialization, vote submission, and verification of zero-knowledge proofs. All votes stored on-chain are encrypted, and the contract never observes plaintext votes or voter identities.

Program ID: `AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv`

### 2. Relayer Middleware

The relayer acts as the off-chain coordination layer for privacy-preserving computation. It handles snapshot generation, MPC-based ballot encryption, proof verification, and transaction relaying.

The relayer integrates Noir circuits compiled to Barretenberg for zk proof generation and Arcium for secure multi-party computation.

### 3. SDK

Solvrn provides a high-level SDK for application developers, abstracting away cryptographic complexity and protocol-specific details.

The SDK supports TypeScript and JavaScript and integrates with standard Solana tooling such as wallet adapters, Anchor providers, and solana-web3.js.

### 4. Frontend Interface

A reference frontend is implemented using React and Vite. It provides a user-facing interface for proposal creation, private voting, and transaction monitoring, while preserving all protocol privacy guarantees.

Supported wallets include Phantom, Solflare, and other standard Solana wallets.

## Privacy Pipeline

The voting process follows a strictly defined privacy-preserving pipeline.

1. Eligibility verification is performed using a zero-knowledge proof that demonstrates membership in the eligible voter set without revealing the voter’s identity.
2. The vote is encrypted using threshold cryptography coordinated through Arcium MPC, ensuring that no single party can decrypt ballots.
3. A nullifier is generated to prevent double voting while preserving anonymity.
4. Vote tallies are computed and verified through a zero-knowledge proof that confirms correctness without revealing individual votes.

## Cryptographic Stack

Solvrn relies on the following cryptographic components:

- **Noir**: Zero-knowledge circuit language for eligibility proofs and tally verification
- **Barretenberg**: High-performance proof generation and verification backend
- **Arcium**: Secure multi-party computation for ballot encryption
- **Helius**: High-performance Solana RPC access (optional, can use public RPC)

## On-Chain Data Model

Proposals are stored as encrypted metadata along with execution parameters.
Votes are recorded as encrypted ciphertexts paired with nullifiers.
Results are revealed only after successful verification of a zero-knowledge tally proof.

At no point does the protocol expose voter identities or plaintext ballots on-chain.

## Core Features

Private voting is enforced end-to-end, ensuring that voter identity and voting choice remain confidential.

Quadratic voting is supported, allowing voting power to scale with token holdings while preserving privacy guarantees.

Treasury execution can be triggered on-chain based on verified voting outcomes, enabling trust-minimized governance-controlled fund management.

Gasless voting is supported through the relayer, allowing users to participate without holding SOL.

## Current Status

Core functionality is production-ready:

- **Proposal Creation**: Creates on-chain proposals with Merkle tree snapshots from token holders
- **Vote Casting**: Votes encrypted using Arcium MPC and stored on-chain with nullifiers preventing double voting
- **Eligibility Verification**: Zero-knowledge proofs verify voter eligibility without revealing identity
- **Vote Storage**: Encrypted votes stored on-chain with accurate vote counts
- **Tally Proof Generation**: Zero-knowledge proofs verify majority thresholds and quorum requirements
- **Merkle Trees**: Built from token holder snapshots with quadratic voting weights

**Vote Decryption**: Vote breakdown is currently simulated. Votes are encrypted correctly, but Arcium MPC decryption requires a finalized computation definition on-chain. The MPC integration code is complete and ready.

## SDK Usage

### Installation

```bash
npm install solvrn-sdk
```

### Example

```typescript
import { SolvrnClient } from 'solvrn-sdk';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

const solvrn = new SolvrnClient(
  'https://your-relayer.com',  // Relayer URL
  'DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS',  // Arcium Program ID
  'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv'   // Solvrn Program ID
);

await solvrn.init(circuitJson); // Initialize ZK backend

const { proposalId, txid } = await solvrn.createProposal(
    provider,
    authority,
    votingMint,
    metadata,
    0.05  // Gas buffer (SOL)
);

const result = await solvrn.castVote(
    provider,
    voterAddress,
    proposalId,
    1  // 0 = NO, 1 = YES
);
```

See [SDK Documentation](./sdk/README.md) for full API reference.

## Technical Details

### Architecture

Solvrn consists of four main components:

1. **Solana Smart Contract**: On-chain program that stores proposals and encrypted votes. Program ID: `AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv`

2. **Relayer Middleware**: Node.js/Express server that handles snapshot generation, Merkle tree construction, proof verification, and transaction relaying. The relayer also handles vote decryption (currently simulated).

3. **SDK**: TypeScript library (`solvrn-sdk`) that abstracts cryptographic operations and provides a simple API for building voting applications.

4. **Frontend**: React/Vite reference implementation showing how to integrate the SDK.

### Cryptographic Stack

- **Noir**: Zero-knowledge circuit language for eligibility proofs and tally verification
- **Barretenberg**: ZK proof generation backend (UltraHonk)
- **Arcium**: Secure multi-party computation for ballot encryption (threshold cryptography)
- **Merkle Trees**: Built from token holder snapshots with quadratic voting weights

### Privacy Pipeline

1. Eligibility verification via ZK proof (proves membership in voter set without revealing identity)
2. Vote encryption using Arcium MPC (threshold cryptography ensures no single party can decrypt)
3. Nullifier generation (prevents double voting while preserving anonymity)
4. On-chain storage (only encrypted ciphertexts are stored)
5. Tally verification via ZK proof (proves correctness without revealing individual votes)

Note: Vote decryption is currently simulated. Votes are encrypted correctly, but the yes/no breakdown uses simulated values until Arcium MPC decryption is implemented.

## Security Model

Solvrn provides strong privacy guarantees by ensuring that voter identities and voting choices are never revealed on-chain and cannot be correlated through protocol interactions.

Integrity is enforced through nullifiers that prevent double voting, zero-knowledge verified tallies, and immutable on-chain records. All critical state transitions are verifiable and auditable without compromising privacy.

The encryption and ZK proof systems are production-ready. Vote decryption is simulated but doesn't affect privacy guarantees - votes remain encrypted and private.

## Development

Local development requires Node.js version 18 or higher, the Solana CLI, the Anchor framework, the Noir compiler, and a Rust toolchain.

The relayer, contracts, and frontend can be run independently for development and testing.

## Project Structure

```
solvrn/
├── sdk/              # Solvrn SDK (published to npm as solvrn-sdk)
├── relayer/          # Relayer middleware (Node.js/Express)
├── frontend/         # React/Vite frontend
├── contracts/        # Solana program (Anchor)
└── svrn_engine/      # Arcium MPC circuit definitions
```

## Links

- **SDK**: https://www.npmjs.com/package/solvrn-sdk
- **Documentation**: See [sdk/README.md](./sdk/README.md)

## License

ISC License
