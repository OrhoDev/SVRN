# SOLVRN

[![npm](https://img.shields.io/npm/v/solvrn-sdk)](https://www.npmjs.com/package/solvrn-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

SOLVRN is a private governance protocol for Solana that enables confidential on-chain voting using zero-knowledge proofs and secure multi-party computation.

Traditional governance systems can't keep votes private while staying verifiable. SOLVRN solves this by allowing participants to vote without revealing their identity, voting power, or preferences while the system enforces eligibility, prevents double voting, and produces a fully verifiable tally.

The protocol supports DAO voting, treasury management, and quadratic voting while keeping all votes private at every stage.

**Early Development:** SOLVRN is still in active development. The protocol works but is being refined. The live preview at [solvrn.vercel.app](https://solvrn.vercel.app) is a development demo that showcases capabilities.

## Quick Start

Install the SDK from npm.

```bash
npm install solvrn-sdk
```

Basic example using the default relayer.

```typescript
import { SolvrnClient } from 'solvrn-sdk';

const solvrn = new SolvrnClient();
await solvrn.init();

const { proposalId } = await solvrn.createProposal(
  provider,
  authority,
  votingMint,
  { title: "Proposal Title", desc: "Description", duration: 3600 },
  0.05
);

await solvrn.castVote(provider, wallet.publicKey.toBase58(), proposalId, 1);
```

Production example with custom relayer and program IDs.

```typescript
const solvrn = new SolvrnClient(
  'https://your-relayer.com',
  'DBC...eb9JTS',  // Arcium Program ID
  'AL2...J3LXcv'   // SOLVRN Program ID
);
```

See the full API reference at [sdk/README.md](./sdk/README.md).

## Default Relayer Warning

The SDK includes a temporary default relayer at `https://farms-series-congress-baseball.trycloudflare.com` for quick testing. This is a Cloudflare tunnel that could change or disappear without notice. Do not use it for production or anything important. A real, reliable relayer will be added soon.

For production deployments, run your own relayer instance. See the Development section below for setup instructions.

## Architecture

SOLVRN has four main components that work together to enable private voting.

The Solana smart contract stores proposals and encrypted votes while verifying zero-knowledge proofs. The contract never sees plaintext votes or voter identities and is deployed at `AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv`.

The relayer handles off-chain computation including snapshot generation, Merkle tree construction, ballot encryption using Arcium MPC, and proof verification. The relayer coordinates threshold cryptography so no single party can decrypt votes.

The SDK abstracts cryptographic operations into a simple API that works with standard Solana tooling like wallet adapters and solana-web3.js. Developers can build governance apps without dealing with the cryptography directly.

The frontend is a reference implementation that demonstrates the SDK integration and provides an interface for creating proposals, casting votes, and monitoring transactions.

## Privacy Pipeline

The voting process follows a strict privacy pipeline that protects voter identity at every step.

First, eligibility gets verified using zero-knowledge proofs that confirm membership in the voter set without revealing identity. Then the vote gets encrypted through threshold cryptography coordinated by Arcium MPC. This ensures no single party can decrypt ballots. A nullifier gets generated to prevent double voting while preserving anonymity. The encrypted vote gets stored on-chain. Finally, the tally gets verified using zero-knowledge proofs that confirm correctness without exposing individual votes.

## Cryptographic Stack

The protocol uses several cryptographic tools to ensure privacy and verifiability.

Noir provides the zero-knowledge circuit language for eligibility proofs and tally verification. Barretenberg handles high-performance proof generation and verification. Arcium manages secure multi-party computation for ballot encryption. Helius provides high-performance Solana RPC access, though you can use public endpoints too.

Merkle trees are built from token holder snapshots with quadratic voting weights. This supports governance models where voting power scales with holdings.

## Technical Details

The relayer runs on Node.js with Express and uses several cryptographic backends. It initializes Barretenberg WASM for zero-knowledge proof generation and Noir for circuit compilation while maintaining in-memory databases for snapshots and vote storage.

The relayer integrates with Arcium MPC for threshold cryptography. When a vote gets cast, the system generates a nullifier to prevent double voting. Then it encrypts the ballot through Arcium's multi-party computation to ensure no single party can decrypt individual votes.

The SDK bundles the default Noir circuit so developers don't need to compile circuits themselves. The client handles proof generation locally using Barretenberg's UltraHonk backend. Then it sends the proof to the relayer for verification.

On-chain, the Solana program stores only encrypted ciphertexts and nullifiers. The contract verifies zero-knowledge proofs but never sees plaintext votes or voter identities. Merkle trees get built from token holder snapshots with quadratic voting weights.

The system uses rate limiting and input validation to prevent abuse. All API endpoints are protected by CORS and JSON parsing middleware.

## Core Features

The protocol provides end-to-end private voting where identity and voting choice stay confidential throughout the process.

Quadratic voting is built into the protocol by default. Voting power scales with token holdings while preserving full privacy. Treasury execution can be triggered on-chain based on verified voting outcomes. This enables trust-minimized governance-controlled fund management.

## Current Implementation

The protocol is fully functional for private governance with one component still in progress.

The core voting infrastructure is complete. Proposal creation works end-to-end and builds real on-chain proposals with Merkle tree snapshots from actual token holders. Vote casting uses real Arcium MPC encryption to store votes on-chain. Nullifiers prevent double voting. Eligibility verification runs through real Noir zero-knowledge circuits that verify voter eligibility without revealing identity. The system maintains accurate and verifiable vote counts with encrypted votes stored in Solana accounts. Tally proof generation produces real zero-knowledge proofs that verify majority thresholds and quorum requirements. All on-chain transactions are verifiable on the blockchain.

Vote decryption is the one piece still being implemented. The `getVoteCounts()` function returns accurate total vote counts, but the yes/no breakdown currently uses simulated values. Votes are encrypted and stored correctly using Arcium MPC. The full decryption workflow wasn't completed before the hackathon deadline. This doesn't affect the core privacy guarantees since votes remain encrypted throughout.

## Development

Local development requires Node.js 18 or higher, Solana CLI, Anchor framework, Noir compiler, and Rust toolchain. The relayer and contracts can run independently for testing.

Clone the repository and install dependencies.

```bash
git clone https://github.com/OrhoDev/SVRN.git
cd SVRN/relayer
npm install
npm run build
```

Configure your environment variables by copying `.env.example` to `.env` and setting your RPC URL and program IDs. Generate a relayer keypair with `solana-keygen new -o relayer-keypair.json` and start the relayer with `npm start`.

Note that proof generation can take several seconds depending on your hardware. RPC rate limits may also affect snapshot generation for large token holder sets.

## Security Model

SOLVRN ensures that voter identities and voting choices are never revealed on-chain and cannot be correlated through protocol interactions.

Integrity is enforced through nullifiers that prevent double voting, zero-knowledge verified tallies, and immutable on-chain records. All critical state transitions are verifiable and auditable without compromising privacy.

The encryption and ZK proof systems are implemented end-to-end and used in the current flow. Vote decryption is simulated but this doesn't affect the privacy guarantees since votes remain encrypted and private regardless.

## Project Structure

```
solvrn/
├── sdk/              # SOLVRN SDK (published to npm as solvrn-sdk)
├── relayer/          # Node.js/Express middleware for off-chain computation
├── frontend/         # Demo frontend showcasing SDK integration
├── contracts/        # Solana program (Anchor framework)
├── svrn_engine/      # Core engine implementation
```

## Links

- SDK: [npmjs.com/package/solvrn-sdk](https://www.npmjs.com/package/solvrn-sdk)
- Documentation: [sdk/README.md](./sdk/README.md)
- Live Demo: [solvrn.vercel.app](https://solvrn.vercel.app) 
- Repository: [github.com/OrhoDev/SVRN](https://github.com/OrhoDev/SVRN)

## License

MIT