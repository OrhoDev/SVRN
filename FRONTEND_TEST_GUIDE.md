# Frontend Testing Guide

## ✅ What's Been Added

### 1. SDK Updated to Trustless Mode
- SDK now initialized with `trustlessMode: true`
- Helius RPC URL configured: `https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db`
- Snapshot builder enabled

### 2. New Test Buttons Added
- **"🧪 TEST: Build Snapshot Locally"** - Tests trustless snapshot building
- **"🧪 TEST: Gasless Voting"** - Tests message signing and gasless voting

### 3. New Handler Functions
- `handleTestSnapshotBuilding()` - Builds snapshot client-side
- `handleTestGaslessVoting()` - Signs vote message and submits

## 🚀 How to Test

### Step 1: Start Services

```bash
# Terminal 1: Start relayer
cd relayer
npm start

# Terminal 2: Start frontend
cd frontend
npm run dev
```

### Step 2: Open Frontend

Navigate to: `http://localhost:5173`

### Step 3: Connect Wallet

1. Click "Select Wallet" button
2. Connect with Phantom or Solflare
3. Make sure you're on **Devnet**

### Step 4: Test Snapshot Building

1. **Enter a voting token mint** (e.g., SOL: `So11111111111111111111111111111111111111112`)
2. Click **"🧪 TEST: Build Snapshot Locally"**
3. Watch the terminal output:
   - Should fetch token holders from Helius RPC
   - Build Merkle tree locally
   - Show snapshot root and voter count
   - Display your voting weight if eligible

**Expected Output:**
```
✅ Snapshot built! Root: 0xabc123... | Voters: 5 | Your weight: 1000
```

### Step 5: Test Gasless Voting

1. **First create a proposal** (or use existing proposal ID)
2. Click **"🧪 TEST: Gasless Voting"**
3. Watch the terminal output:
   - Should sign vote message locally
   - Verify signature
   - Submit signed vote to relayer

**Expected Output:**
```
✅ Vote signed! Signature: dGVzdHNpZ25hdHVyZQ==... | Ready to submit
✅ Vote submitted! TX: 5j7xK9mP...
```

## 🔍 What to Look For

### Snapshot Building Test
- ✅ Fetches token holders from Helius RPC
- ✅ Builds Merkle tree locally (no relayer)
- ✅ Shows your eligibility and voting weight
- ✅ Snapshot root matches relayer's root (if proposal exists)

### Gasless Voting Test
- ✅ Signs vote message (no transaction needed)
- ✅ Signature verification passes
- ✅ Relayer accepts signed vote
- ✅ Transaction submitted on-chain

## ⚠️ Security Note

**IMPORTANT**: Never commit your Helius API key to git!

1. Create a `.env` file in the `frontend/` directory
2. Copy `.env.example` to `.env`
3. Add your Helius API key: `VITE_HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY`
4. Add `.env` to `.gitignore` (already done)

## ⚠️ Troubleshooting

### "PedersenHash serialization error"
- **Cause**: Barretenberg v3.x API differs from v2.1.11
- **Fix**: Client-side snapshot building is experimental. Use relayer for now.
- **Workaround**: Disable trustless mode or use standard `createProposal()` flow

### "RPC doesn't support getTokenAccounts"
- **Cause**: Helius RPC endpoint might not support custom methods
- **Fix**: Check Helius API documentation for `getTokenAccounts` support
- **Workaround**: Test with mock snapshot data

### "Signature verification failed"
- **Cause**: Wallet adapter might not support `signMessage`
- **Fix**: Ensure wallet is connected and supports message signing
- **Workaround**: Use standard `castVote()` method

### "Relayer not accessible"
- **Cause**: Relayer not running
- **Fix**: Start relayer with `cd relayer && npm start`
- **Check**: Visit `http://localhost:3000/health`

### "SDK initialization failed"
- **Cause**: Circuit JSON not found or WASM loading failed
- **Fix**: Ensure `frontend/circuit/target/circuit.json` exists
- **Check**: Run `cd frontend/circuit && nargo compile`

## 📊 Expected Behavior

### Snapshot Building
1. Click button → Shows "Building snapshot locally..."
2. Fetches from Helius RPC → Shows progress
3. Builds Merkle tree → Shows voter count
4. Checks eligibility → Shows your weight
5. Displays result → Shows root and stats

### Gasless Voting
1. Click button → Shows "Signing vote message..."
2. Signs message → Shows signature preview
3. Verifies signature → Shows verification status
4. Submits to relayer → Shows transaction ID
5. Displays result → Shows success/failure

## 🎯 Success Criteria

✅ **Snapshot Building:**
- No errors in console
- Snapshot root displayed
- Voter count > 0
- Your weight displayed (if eligible)

✅ **Gasless Voting:**
- Message signed successfully
- Signature verified
- Vote submitted to relayer
- Transaction ID received

## 📝 Notes

- **Helius RPC**: Currently configured for devnet
- **Trustless Mode**: Enabled by default
- **Gasless Voting**: Requires wallet message signing support
- **Snapshot Building**: Requires Helius `getTokenAccounts` method

## 🔗 Related Files

- `frontend/src/App.jsx` - Main frontend code
- `sdk/src/snapshot.ts` - Snapshot builder
- `sdk/src/signing.ts` - Message signing
- `USAGE_GUIDE.md` - Complete usage guide

