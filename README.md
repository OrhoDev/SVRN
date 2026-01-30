# SVRN

SVRN is a private governance protocol for Solana that enables confidential on-chain voting using zero-knowledge proofs and secure multi-party computation.

The protocol addresses a core limitation of decentralized governance systems: the inability to preserve voter privacy while maintaining public verifiability. SVRN allows participants to vote without revealing identity, voting power, or preferences, while still enforcing eligibility, preventing double voting, and producing a verifiable tally.

## Overview

SVRN combines zero-knowledge proofs for eligibility verification with MPC-based ballot encryption to ensure that voting remains private throughout its entire lifecycle. Votes are recorded on-chain only as encrypted ciphertexts, and results are revealed exclusively through zero-knowledge verified tallies.

The system is designed to support real-world governance use cases such as DAO voting, treasury management, and quadratic voting without leaking sensitive information.

## Architecture

SVRN is composed of four primary components.

### 1. Solana Smart Contract

The on-chain program is responsible for proposal initialization, vote submission, and verification of zero-knowledge proofs. All votes stored on-chain are encrypted, and the contract never observes plaintext votes or voter identities.

Program ID
2BFMGPa8TvvLhyDhND8BXCDLwNibYapp1zsxBXrSrjDg

### 2. Relayer Middleware

The relayer acts as the off-chain coordination layer for privacy-preserving computation. It handles snapshot generation, MPC-based ballot encryption, proof verification, and transaction relaying.

The relayer integrates Noir circuits compiled to Barretenberg for zk proof generation and Arcium for secure multi-party computation.

### 3. SDK

SVRN provides a high-level SDK for application developers, abstracting away cryptographic complexity and protocol-specific details.

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

SVRN relies on the following cryptographic components.

Noir is used to define zero-knowledge circuits for eligibility proofs and tally verification.
Barretenberg provides high-performance proof generation and verification.
Arcium enables secure multi-party computation for ballot encryption.
Helius is used for high-performance Solana RPC access.

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

## SDK Usage

### Installation

```bash
npm install @svrn/sdk
```

### Example

```javascript
import { SvrnClient } from '@svrn/sdk';

const svrn = new SvrnClient('https://relayer.svrn.io');
await svrn.init(circuitJson);

const { proposalId, txid } = await svrn.createProposal(
    provider,
    authority,
    votingMint,
    metadata,
    gasBuffer
);

const result = await svrn.castVote(
    provider,
    voterAddress,
    proposalId,
    choice
);
```

## Development Environment

Local development requires Node.js version 18 or higher, the Solana CLI, the Anchor framework, the Noir compiler, and a Rust toolchain.

The relayer, contracts, and frontend can be run independently for development and testing.

## Security Model

SVRN provides strong privacy guarantees by ensuring that voter identities and voting choices are never revealed on-chain and cannot be correlated through protocol interactions.

Integrity is enforced through nullifiers that prevent double voting, zero-knowledge verified tallies, and immutable on-chain records. All critical state transitions are verifiable and auditable without compromising privacy.

## Contributing

Contributions are welcome across protocol design, cryptographic improvements, performance optimizations, and user interface development. Security disclosures should be reported responsibly.

## License

This project is licensed under the MIT License.

## Contact

Technical discussions and issues can be opened on GitHub.
Security disclosures should be sent to [security@svrn.io](mailto:security@svrn.io).
Partnership inquiries can be directed to [partnerships@svrn.io](mailto:partnerships@svrn.io).
