# Setup Guide

Quick setup guide for local development.

## Prerequisites

- Node.js 18+ and npm
- Solana CLI (`solana --version`)
- Git

## 1. Clone Repository

```bash
git clone https://github.com/solvrn-labs/solvrn.git
cd solvrn
```

## 2. Install Dependencies

```bash
# SDK
cd sdk && npm install && cd ..

# Relayer
cd relayer && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

## 3. Configure Relayer

```bash
cd relayer

# Copy environment template
cp .env.example .env

# Generate relayer keypair
solana-keygen new -o relayer-keypair.json

# Fund the wallet (devnet)
solana airdrop 1 $(solana address -k relayer-keypair.json) --url devnet

# Edit .env with your values
# At minimum, set HELIUS_RPC_URL if using Helius
```

## 4. Configure Frontend

```bash
cd frontend

# Copy environment template
cp .env.example .env.local

# Edit .env.local
# Set VITE_RELAYER_URL=http://localhost:3000
```

## 5. Start Development

**Terminal 1 - Relayer:**
```bash
cd relayer
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## 6. Verify Setup

1. Open frontend: http://localhost:5173
2. Check relayer health: http://localhost:3000/health
3. Connect wallet (Phantom/Solflare on devnet)
4. Create a test proposal

## Troubleshooting

**Relayer won't start:**
- Check `relayer-keypair.json` exists
- Verify `.env` is configured
- Ensure wallet has SOL: `solana balance <PUBKEY> --url devnet`

**Frontend can't connect:**
- Verify relayer is running on port 3000
- Check `VITE_RELAYER_URL` in `.env.local`
- Check browser console for errors

**SDK errors:**
- Ensure relayer is running
- Check network tab for failed API calls
- Verify program IDs match between relayer and frontend

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- See [sdk/README.md](./sdk/README.md) for SDK documentation
- See [relayer/README.md](./relayer/README.md) for relayer API docs

