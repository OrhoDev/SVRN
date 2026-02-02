# SVRN Quick Start

## 🎯 What We Have Now

### ✅ Working Features

1. **Standard Voting** (Original)
   - Create proposals via relayer
   - Vote with relayer-provided proofs
   - Relayer pays gas

2. **Trustless Snapshot Building** (NEW ✨)
   - Build snapshots client-side
   - No trust in relayer for snapshot
   - Wallet hidden from relayer

3. **Gasless Voting** (NEW ✨)
   - Sign vote messages (free)
   - Relayer submits later
   - No gas cost for users

4. **IPFS Support** (API Ready)
   - Upload/download snapshots
   - Decentralized distribution

## 🚀 How to Use

### Quick Test

```bash
# 1. Start relayer
cd relayer && npm start

# 2. Test features
node test-features.js
```

### In Your Code

```javascript
import { SolvrnClient } from 'solvrn-sdk';

// Standard mode (existing)
const solvrn = new SolvrnClient('http://localhost:3000');
await solvrn.init(circuitJson);
await solvrn.castVote(provider, wallet, proposalId, 1);

// Trustless mode (new)
const solvrn = new SolvrnClient({
    relayerUrl: 'http://localhost:3000',
    rpcUrl: 'https://helius-rpc.com/?api-key=xxx',
    trustlessMode: true
});
const snapshot = await solvrn.buildSnapshotLocal(rpcUrl, mint);
await solvrn.castVoteLocal(provider, snapshot, wallet, proposalId, 1);

// Gasless voting (new)
const signedVote = await solvrn.signVote(provider, wallet, proposalId, 1);
await solvrn.submitSignedVote(signedVote);
```

## 📋 What's Next

### Immediate (Ready to Test)
- [x] SDK builds and exports work
- [x] Basic utilities tested
- [ ] Test snapshot building with real RPC
- [ ] Test message signing with wallet
- [ ] End-to-end integration test

### Short Term (1-2 weeks)
- [ ] Add IPFS upload endpoint to relayer
- [ ] Integrate wallet message signing
- [ ] Add snapshot caching
- [ ] Update frontend to use new features

### Long Term (Future)
- [ ] Separate proof/vote relayers
- [ ] Tor/VPN routing
- [ ] Vote batching
- [ ] On-chain snapshot verification

## 🧪 How to Test

### 1. Basic Test (Works Now)
```bash
node test-features.js
```

### 2. Test Snapshot Building
```javascript
// Requires Helius RPC with getTokenAccounts
const snapshot = await solvrn.buildSnapshotLocal(
    'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
    'YOUR_TOKEN_MINT'
);
console.log(`Root: ${snapshot.root}`);
console.log(`Voters: ${snapshot.voters.length}`);
```

### 3. Test Gasless Voting
```javascript
// Sign vote (free)
const signedVote = await solvrn.signVote(provider, wallet, proposalId, 1);

// Verify signature
const { verifySignedVote } = await import('solvrn-sdk');
const valid = verifySignedVote(signedVote, proposalId);
console.log(`Valid: ${valid.valid}`);

// Submit (relayer pays gas)
await solvrn.submitSignedVote(signedVote);
```

### 4. Test End-to-End
```javascript
// 1. Create proposal
const { proposalId } = await solvrn.createProposal(...);

// 2. Build snapshot locally
const snapshot = await solvrn.buildSnapshotLocal(rpcUrl, mint);

// 3. Vote locally
await solvrn.castVoteLocal(provider, snapshot, wallet, proposalId, 1);

// 4. Tally
await solvrn.api.proveTally(proposalId, yesVotes, noVotes, threshold, quorum);
```

## 📚 Documentation

- **USAGE_GUIDE.md** - Complete usage guide
- **sdk/README.md** - SDK API documentation
- **frontend/src/App.jsx** - Frontend examples

## 🔍 Current Status

✅ **Working:**
- SDK builds successfully
- All exports available
- Basic utilities tested
- Relayer running
- Frontend running

⚠️ **Needs Testing:**
- Snapshot building with real RPC
- Message signing with wallet
- IPFS upload/download
- End-to-end flow

❌ **Not Yet Implemented:**
- IPFS upload endpoint in relayer
- Wallet adapter integration for signing
- Snapshot caching
- On-chain snapshot verification

## 💡 Key Differences

| Feature | Standard Mode | Trustless Mode | Gasless Voting |
|---------|--------------|----------------|----------------|
| Snapshot | Relayer builds | Client builds | Either |
| Proof | Relayer provides | Client generates | Either |
| Wallet Privacy | Relayer sees | Hidden | Hidden |
| Gas Payment | Relayer pays | User pays | Relayer pays |
| Trust Required | High | Low | Medium |

## 🎯 Recommended Approach

**For Maximum Privacy:**
```javascript
// Build snapshot locally + sign vote
const snapshot = await solvrn.buildSnapshotLocal(rpcUrl, mint);
const signedVote = await solvrn.signVote(provider, wallet, proposalId, 1);
await solvrn.submitSignedVote(signedVote);
```

**For Ease of Use:**
```javascript
// Let relayer handle everything
await solvrn.castVote(provider, wallet, proposalId, 1);
```

## 🐛 Troubleshooting

**Relayer not responding:**
```bash
cd relayer && npm start
```

**SDK build errors:**
```bash
cd sdk && npm run build
```

**Frontend errors:**
```bash
cd frontend && npm run dev
```

**Missing circuit JSON:**
```bash
cd frontend/circuit && nargo compile
```

