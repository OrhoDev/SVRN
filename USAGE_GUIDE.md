# SVRN SDK Usage Guide

## What We Have Now

### ✅ Core Features (Working)

1. **Standard Voting Flow** (Existing)
   - `createProposal()` - Create proposals via relayer
   - `castVote()` - Vote with relayer-provided proofs
   - Relayer handles snapshot building, proof generation, and transaction relaying

2. **New: Trustless Snapshot Building** (Just Added)
   - `buildSnapshotLocal()` - Build snapshots client-side (no relayer trust)
   - `getProofLocal()` - Get Merkle proofs from local snapshot
   - `castVoteLocal()` - Vote using local snapshot (relayer only sees nullifier)
   - `serializeSnapshot()` / `deserializeSnapshot()` - Store snapshots

3. **New: Gasless Voting** (Just Added)
   - `signVote()` - Sign vote message (free, no gas)
   - `submitSignedVote()` - Submit signed vote to relayer
   - `castGaslessVote()` - Sign and submit in one call

4. **New: IPFS Support** (API Ready)
   - `uploadSnapshotToIPFS()` - Upload snapshots to IPFS
   - `getSnapshotCID()` - Get IPFS CID for proposals
   - `fetchSnapshotFromIPFS()` - Fetch snapshots from IPFS

### 🔧 Current Architecture

```
┌─────────────┐
│   Frontend  │
│  (React)    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  SVRN SDK   │────▶│   Relayer    │────▶│   Solana    │
│ (TypeScript)│     │  (Express)   │     │  Program    │
└─────────────┘     └──────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│   Arcium    │
│     MPC     │
└─────────────┘
```

## What's Next (Roadmap)

### Phase 1: Complete Trustless Mode (High Priority)
- [ ] Test snapshot building with real RPC (Helius `getTokenAccounts`)
- [ ] Integrate `buildSnapshotLocal()` into `createProposal()` flow
- [ ] Make relayer optional for snapshot building
- [ ] Add snapshot caching/storage

### Phase 2: Gasless Voting Integration (High Priority)
- [ ] Add wallet message signing support (Solana wallet adapters)
- [ ] Update relayer to accept signed votes
- [ ] Add signature verification on relayer
- [ ] Test end-to-end gasless flow

### Phase 3: IPFS Distribution (Medium Priority)
- [ ] Add IPFS upload endpoint to relayer
- [ ] Store snapshot CIDs on-chain or in relayer DB
- [ ] Add IPFS gateway fallback logic
- [ ] Test snapshot fetching from IPFS

### Phase 4: Enhanced Privacy (Future)
- [ ] Separate proof relayer from vote relayer
- [ ] Add Tor/VPN routing for proof requests
- [ ] Implement vote batching
- [ ] Add time-delayed vote submission

## How to Test

### Prerequisites

```bash
# 1. Start the relayer
cd relayer
npm start

# 2. Start the frontend (in another terminal)
cd frontend
npm run dev

# 3. Build the SDK (if you made changes)
cd sdk
npm run build
```

### Test 1: Standard Flow (Existing)

```javascript
import { SolvrnClient } from 'solvrn-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';
import circuitJson from './circuit.json';

// Initialize
const connection = new Connection('https://api.devnet.solana.com');
const wallet = new Wallet(Keypair.generate());
const provider = new AnchorProvider(connection, wallet, {});

const solvrn = new SolvrnClient('http://localhost:3000');
await solvrn.init(circuitJson);

// Create proposal
const { proposalId, txid } = await solvrn.createProposal(
    provider,
    wallet.publicKey,
    'So11111111111111111111111111111111111111112', // SOL mint
    { title: 'Test', desc: 'Test proposal', duration: 24 },
    0.1 // gas buffer
);

// Vote
const result = await solvrn.castVote(
    provider,
    wallet.publicKey.toBase58(),
    proposalId,
    1 // YES
);
```

### Test 2: Trustless Snapshot Building (New)

```javascript
import { SolvrnClient } from 'solvrn-sdk';

// Initialize with trustless mode
const solvrn = new SolvrnClient({
    relayerUrl: 'http://localhost:3000',
    rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
    trustlessMode: true
});

await solvrn.init(circuitJson);

// Build snapshot locally (requires Helius RPC with getTokenAccounts)
const snapshot = await solvrn.buildSnapshotLocal(
    'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
    'YOUR_TOKEN_MINT'
);

console.log(`Snapshot root: ${snapshot.root}`);
console.log(`Voters: ${snapshot.voters.length}`);

// Check eligibility
if (solvrn.isEligible(snapshot, walletPubkey)) {
    const weight = solvrn.getVotingWeight(snapshot, walletPubkey);
    console.log(`Voting weight: ${weight}`);
}

// Get proof locally
const proof = solvrn.getProofLocal(snapshot, walletPubkey);
console.log(`Proof path length: ${proof.path.length}`);

// Vote using local snapshot
await solvrn.castVoteLocal(
    provider,
    snapshot,
    walletPubkey,
    proposalId,
    1 // YES
);
```

### Test 3: Gasless Voting (New)

```javascript
// Sign vote (free, no gas)
const signedVote = await solvrn.signVote(
    provider,
    walletPubkey,
    proposalId,
    1 // YES
);

console.log(`Signature: ${signedVote.signature}`);

// Submit later (relayer pays gas)
const result = await solvrn.submitSignedVote(signedVote);

// Or do both at once
const result = await solvrn.castGaslessVote(
    provider,
    walletPubkey,
    proposalId,
    1
);
```

### Test 4: Snapshot Serialization (New)

```javascript
// Build snapshot
const snapshot = await solvrn.buildSnapshotLocal(rpcUrl, mint);

// Serialize for storage
const serialized = solvrn.serializeSnapshot(snapshot);
localStorage.setItem(`snapshot-${proposalId}`, serialized);

// Deserialize later
const stored = localStorage.getItem(`snapshot-${proposalId}`);
const snapshot = solvrn.deserializeSnapshot(stored);
```

## How to Use

### Option 1: Standard Mode (Current Default)

**Use Case**: Quick setup, relayer handles everything

```javascript
const solvrn = new SolvrnClient('http://localhost:3000');
await solvrn.init(circuitJson);

// Relayer builds snapshot, provides proofs, relays transactions
await solvrn.createProposal(...);
await solvrn.castVote(...);
```

**Pros:**
- Simple, works out of the box
- No RPC requirements
- Relayer pays gas

**Cons:**
- Relayer sees wallet addresses (privacy concern)
- Requires trust in relayer for snapshot

### Option 2: Trustless Mode (New)

**Use Case**: Maximum privacy, eliminate relayer trust

```javascript
const solvrn = new SolvrnClient({
    relayerUrl: 'http://localhost:3000',
    rpcUrl: 'https://helius-rpc.com/?api-key=xxx',
    trustlessMode: true
});

await solvrn.init(circuitJson);

// Build snapshot locally
const snapshot = await solvrn.buildSnapshotLocal(rpcUrl, mint);

// Vote with local proof (relayer only sees nullifier)
await solvrn.castVoteLocal(provider, snapshot, wallet, proposalId, choice);
```

**Pros:**
- No trust in relayer for snapshot
- Wallet hidden from relayer (only nullifier visible)
- Snapshot verifiable by anyone

**Cons:**
- Requires Helius-compatible RPC
- Client-side computation (slower)
- User pays gas (unless using gasless voting)

### Option 3: Gasless Voting (New)

**Use Case**: Users don't want to pay gas

```javascript
// Sign vote message (free)
const signedVote = await solvrn.signVote(provider, wallet, proposalId, choice);

// Relayer submits later (pays gas)
await solvrn.submitSignedVote(signedVote);
```

**Pros:**
- No gas cost for users
- Can batch signatures
- Works with any wallet

**Cons:**
- Relayer still sees proof requests (privacy concern)
- Requires relayer to process signatures

### Option 4: Hybrid Mode (Recommended)

**Use Case**: Best of both worlds

```javascript
// Build snapshot locally (trustless)
const snapshot = await solvrn.buildSnapshotLocal(rpcUrl, mint);

// Sign vote (gasless)
const signedVote = await solvrn.signVote(provider, wallet, proposalId, choice);

// Submit (relayer only sees nullifier + signature)
await solvrn.submitSignedVote(signedVote);
```

**Benefits:**
- No trust in snapshot building
- No gas cost
- Maximum privacy (relayer sees minimal info)

## Testing Checklist

### Basic Functionality
- [x] SDK builds successfully
- [x] All exports available
- [x] Relayer responds to health check
- [x] Frontend loads without errors

### Trustless Snapshot Building
- [ ] Build snapshot with real RPC
- [ ] Verify Merkle root matches relayer
- [ ] Generate proofs locally
- [ ] Verify membership

### Gasless Voting
- [ ] Sign vote message
- [ ] Verify signature
- [ ] Submit signed vote
- [ ] Relayer processes signature

### Integration
- [ ] End-to-end flow: create → vote → tally
- [ ] Snapshot serialization round-trip
- [ ] IPFS upload/download
- [ ] Frontend integration

## Current Limitations

1. **Snapshot Building**: Requires Helius-compatible RPC with `getTokenAccounts` method
2. **Message Signing**: Needs wallet adapter integration (not yet tested)
3. **IPFS**: Relayer doesn't have upload endpoint yet (API ready, backend pending)
4. **Privacy**: Relayer still sees proof requests (can correlate with votes)

## Quick Start Example

```javascript
// 1. Install SDK
npm install solvrn-sdk

// 2. Import
import { SolvrnClient } from 'solvrn-sdk';

// 3. Initialize
const solvrn = new SolvrnClient('http://localhost:3000');
await solvrn.init(circuitJson);

// 4. Use
const result = await solvrn.castVote(provider, wallet, proposalId, 1);
```

## Need Help?

- Check `sdk/README.md` for API documentation
- See `frontend/src/App.jsx` for usage examples
- Review `relayer/index.ts` for API endpoints

