# Initialization Instructions for svrn_engine

## Current Status
- ✅ Program deployed: `DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS`
- ✅ MXE account exists
- ❌ Computation definition not initialized (circuit too large for onchain storage)

## The Problem
The circuit file is 48MB, which exceeds the compute unit limit for onchain storage. We need to use offchain storage.

## Solution: Use Offchain Storage

### Step 1: Upload Circuit File
Upload `build/add_together.arcis` to a public URL. Options:
- **IPFS**: Use Pinata, web3.storage, or similar
- **GitHub Releases**: Create a release and upload the file
- **S3**: Upload to a public S3 bucket
- **Any public URL**: As long as it's publicly accessible without auth

### Step 2: Update Rust Code
Once you have the URL, update `programs/svrn_engine/src/lib.rs` line 21:
```rust
source: "https://your-actual-url-here/add_together.arcis".to_string(),
```

### Step 3: Rebuild and Redeploy
```bash
cd svrn_engine
arcium build
anchor build
anchor deploy --provider.cluster devnet
```

### Step 4: Initialize
```bash
yarn run init-mxe
```

## Alternative: Use arcium deploy
According to the Arcium docs, you can also try:
```bash
arcium deploy --skip-deploy --cluster-offset 456 --recovery-set-size 4 \
  --keypair-path ~/.config/solana/id.json \
  --rpc-url https://api.devnet.solana.com
```

This might handle the initialization differently.

