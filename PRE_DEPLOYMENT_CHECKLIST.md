# Pre-Deployment Checklist

Use this checklist before deploying to production.

## Security

- [ ] `relayer-keypair.json` is NOT committed to git
- [ ] `.env` files are NOT committed to git
- [ ] All sensitive values are in environment variables
- [ ] Relayer wallet is funded with SOL
- [ ] CORS is configured correctly
- [ ] HTTPS is enabled (required for WASM)

## Relayer

- [ ] Environment variables set in deployment platform
- [ ] `RELAYER_KEYPAIR` env var OR `relayer-keypair.json` file exists
- [ ] Health check endpoint works: `/health`
- [ ] RPC URL is correct and accessible
- [ ] Program IDs match frontend configuration

## Frontend

- [ ] All `VITE_*` environment variables set
- [ ] `VITE_RELAYER_URL` points to deployed relayer
- [ ] Build succeeds: `npm run build`
- [ ] No console errors in browser
- [ ] Wallet connection works

## Testing

- [ ] Can create proposal
- [ ] Can cast vote
- [ ] Can get vote counts
- [ ] Can generate tally proof
- [ ] Transactions appear on Solana explorer

## Documentation

- [ ] README.md updated
- [ ] DEPLOYMENT.md reviewed
- [ ] SETUP.md reviewed
- [ ] Environment variables documented

## Deployment Platforms

### Relayer (Render.com/Railway)
- [ ] Repository connected
- [ ] Build command: `npm install`
- [ ] Start command: `npm start`
- [ ] Environment variables configured
- [ ] Health check URL works

### Frontend (Vercel/Netlify)
- [ ] Repository connected
- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`
- [ ] Environment variables configured
- [ ] Custom headers set (COEP, COOP)

## Post-Deployment

- [ ] Test full flow end-to-end
- [ ] Monitor error logs
- [ ] Check relayer wallet balance
- [ ] Verify transactions on-chain
- [ ] Test with multiple wallets

---

**Ready to deploy?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step instructions.

