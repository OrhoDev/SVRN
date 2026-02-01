# Solvrn Relayer

The Solvrn Relayer is the off-chain coordination layer that handles snapshot generation, vote encryption, proof verification, and transaction relaying.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Generate relayer keypair:**
   ```bash
   solana-keygen new -o relayer-keypair.json
   # Fund the wallet: solana airdrop 1 <PUBKEY> --url devnet
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Start production server:**
   ```bash
   npm start
   ```

## Environment Variables

See `.env.example` for required variables.

## API Endpoints

- `GET /health` - Health check
- `GET /next-proposal-id` - Get next proposal ID
- `POST /initialize-snapshot` - Initialize voting snapshot
- `GET /proposal/:id` - Get proposal data
- `GET /get-proof/:proposalId/:userPubkey` - Get Merkle proof
- `POST /relay-vote` - Submit encrypted vote
- `GET /vote-counts/:proposalId` - Get vote counts
- `POST /prove-tally` - Generate ZK tally proof

## Deployment

See [../DEPLOYMENT.md](../DEPLOYMENT.md) for deployment instructions.

## Security

- **Never commit `relayer-keypair.json`** to git
- Use environment variables for sensitive data
- Keep relayer wallet funded with SOL
- Monitor for suspicious activity
