# Solvrn

Solvrn is a private governance protocol for Solana that enables confidential on-chain voting using zero-knowledge proofs and secure multi-party computation.

Traditional governance systems can't keep votes private while staying verifiable. Solvrn solves this by allowing participants to vote without revealing their identity, voting power, or preferences while the system enforces eligibility, prevents double voting, and produces a fully verifiable tally.

The protocol supports DAO voting, treasury management, and quadratic voting while keeping all votes private at every stage.

## Quick Start

Install the SDK from npm.

```bash
npm install solvrn-sdk
```

Here's how to create a proposal and cast a vote.

```typescript
import { SolvrnClient } from 'solvrn-sdk';

const solvrn = new SolvrnClient('https://your-relayer.com');
await solvrn.init(circuitJson);

const { proposalId } = await solvrn.createProposal(provider, authority, mint, metadata, 0.05);
await solvrn.castVote(provider, wallet, proposalId, 1); // 1 = YES, 0 = NO
```

The SDK handles all cryptographic operations and transaction relaying automatically. You can also use the default relayer by creating the client without a URL.

## Default Relayer

The SDK includes a default relayer for development and testing at `https://injured-catering-reactions-protocol.trycloudflare.com`
(URL is subject to change later in development). This allows you to start building immediately without hosting your own relayer.

```typescript
// Uses default relayer automatically
const solvrn = new SolvrnClient();
```

For production deployments, you can run your own relayer instance to ensure availability and control over the infrastructure and your privacy

## Architecture

Solvrn has four main components that work together to enable private voting.

The **Solana smart contract** stores proposals and encrypted votes while verifying zero-knowledge proofs. The contract never sees plaintext votes or voter identities and is deployed at `AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv`.

The **relayer** handles off-chain computation including snapshot generation, Merkle tree construction, ballot encryption using Arcium MPC, and proof verification. The relayer coordinates threshold cryptography so no single party can decrypt votes.

The **SDK** abstracts cryptographic operations into a simple API that works with standard Solana tooling like wallet adapters and solana-web3.js. Developers can build governance apps without dealing with the cryptography directly.

The **frontend** is a reference implementation that demonstrates the SDK integration. It provides an interface for creating proposals, casting votes, and monitoring transactions. This is primarily a showcase site to demonstrate the SDK capabilities rather than a production-ready application.

## Privacy Pipeline

The voting process follows a strict privacy pipeline that protects voter identity at every step.

First, eligibility gets verified using zero-knowledge proofs that confirm membership in the voter set without revealing identity. Then the vote gets encrypted through threshold cryptography coordinated by Arcium MPC, ensuring no single party can decrypt ballots. A nullifier gets generated to prevent double voting while preserving anonymity, and the encrypted vote gets stored on-chain. Finally, the tally gets verified using zero-knowledge proofs that confirm correctness without exposing individual votes.

## Cryptographic Stack

The protocol uses several cryptographic tools to ensure privacy and verifiability.

**Noir** provides the zero-knowledge circuit language for eligibility proofs and tally verification, while **Barretenberg** handles high-performance proof generation and verification. **Arcium** manages secure multi-party computation for ballot encryption, and **Helius** provides high-performance Solana RPC access (though you can use public endpoints too).

Merkle trees are built from token holder snapshots with quadratic voting weights, supporting governance models where voting power scales with holdings.

## Technical Details

The relayer runs on Node.js with Express and uses several cryptographic backends. It initializes Barretenberg WASM for zero-knowledge proof generation and Noir for circuit compilation while maintaining in-memory databases for snapshots and vote storage.

The relayer integrates with Arcium MPC for threshold cryptography. When a vote gets cast, the system generates a nullifier to prevent double voting, then encrypts the ballot through Arcium's multi-party computation to ensure no single party can decrypt individual votes.

The SDK bundles the default Noir circuit so developers don't need to compile circuits themselves. The client handles proof generation locally using Barretenberg's UltraHonk backend, then sends the proof to the relayer for verification.

On-chain, the Solana program stores only encrypted ciphertexts and nullifiers. The contract verifies zero-knowledge proofs but never sees plaintext votes or voter identities. Merkle trees get built from token holder snapshots with quadratic voting weights, where vote power scales with token holdings.

The system uses rate limiting (100 requests per 2 minutes per IP) and input validation to prevent abuse, with all API endpoints protected by CORS and JSON parsing middleware.

## Core Features

The protocol provides end-to-end private voting where identity and voting choice stay confidential throughout the process.

Quadratic voting is built into the protocol by default, allowing voting power to scale with token holdings while preserving full privacy. Treasury execution can be triggered on-chain based on verified voting outcomes, enabling trust-minimized governance-controlled fund management.

## Current Implementation

The protocol is fully functional for private governance with one component still in progress.

The core voting infrastructure is complete. Proposal creation works end-to-end, building real on-chain proposals with Merkle tree snapshots from actual token holders. Vote casting uses real Arcium MPC encryption to store votes on-chain, and nullifiers prevent double voting. Eligibility verification runs through real Noir zero-knowledge circuits that verify voter eligibility without revealing identity. The system maintains accurate, verifiable vote counts with encrypted votes stored in Solana accounts. Tally proof generation produces real zero-knowledge proofs that verify majority thresholds and quorum requirements. All on-chain transactions are verifiable on the blockchain.

Vote decryption is the one piece still being implemented. The `getVoteCounts()` function returns accurate total vote counts, but the yes/no breakdown currently uses simulated values. Votes are encrypted and stored correctly using Arcium MPC, but the full decryption workflow wasn't completed before the hackathon deadline. This doesn't affect the core privacy guarantees since votes remain encrypted throughout.

## SDK Usage

Install the SDK with npm.

```bash
npm install solvrn-sdk
```

Here's a complete example.

```typescript
import { SolvrnClient } from 'solvrn-sdk';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

const solvrn = new SolvrnClient(
  'https://your-relayer.com',
  'DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS',  // Arcium Program ID
  'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv'   // Solvrn Program ID
);

await solvrn.init(circuitJson);

const { proposalId, txid } = await solvrn.createProposal(
    provider,
    authority,
    votingMint,
    metadata,
    0.05  // Gas buffer in SOL
);

const result = await solvrn.castVote(
    provider,
    voterAddress,
    proposalId,
    1  // 0 = NO, 1 = YES
);
```

The SDK bundles a default Noir circuit for convenience, but you can also provide your own circuit for custom eligibility requirements. The `solvrn.init()` method accepts either the bundled circuit or a custom circuit definition.

See the full API reference at [sdk/README.md](./sdk/README.md).

## Development

Local development requires Node.js 18 or higher, Solana CLI, Anchor framework, Noir compiler, and Rust toolchain. The relayer and contracts can run independently for testing.

To get started locally, clone the repository and install dependencies:

```bash
git clone https://github.com/OrhoDev/SVRN.git
cd SVRN/relayer
npm install
npm run build
```

Configure your environment variables by copying `.env.example` to `.env` and setting your RPC URL and program IDs. Generate a relayer keypair with `solana-keygen new -o relayer-keypair.json` and start the relayer with `npm start`.

## Security Model

Solvrn ensures that voter identities and voting choices are never revealed on-chain and cannot be correlated through protocol interactions.

Integrity is enforced through nullifiers that prevent double voting, zero-knowledge verified tallies, and immutable on-chain records. All critical state transitions are verifiable and auditable without compromising privacy.

The encryption and ZK proof systems are production-ready. Vote decryption is simulated but this doesn't affect the privacy guarantees since votes remain encrypted and private regardless.

## Project Structure

```
solvrn/
├── sdk/              # Solvrn SDK (npm: solvrn-sdk)
├── relayer/          # Node.js/Express middleware
├── frontend/         # Demo frontend
├── contracts/        # Solana program (Anchor)
├── svrn_engine/      # Core engine implementation
```

## Links

The SDK is available at https://www.npmjs.com/package/solvrn-sdk.

Documentation is available at [sdk/README.md](./sdk/README.md).

## License

ISC