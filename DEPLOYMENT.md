# Deployment Guide

This guide covers deploying both the Solvrn Relayer and Frontend to production.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Solana CLI (for keypair generation)
- Accounts on deployment platforms:
  - **Relayer**: Render.com, Railway, or similar Node.js hosting
  - **Frontend**: Vercel, Netlify, or similar static hosting

## 1. Relayer Deployment

The relayer is a Node.js Express server that handles snapshot generation, vote encryption, and transaction relaying.

### Option A: Render.com (Recommended)

1. **Create a new Web Service** on Render.com
2. **Connect your repository** (GitHub/GitLab)
3. **Configure build settings:**
   - **Root Directory**: `relayer`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

4. **Set Environment Variables:**
   ```
   NODE_ENV=production
   PORT=10000
   HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
   PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
   ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
   RELAYER_KEYPAIR=<base58-encoded-secret-key>
   ```

5. **Generate Relayer Keypair:**
   ```bash
   cd relayer
   solana-keygen new -o relayer-keypair.json
   # Get the base58 secret key:
   node -e "const fs=require('fs');const bs58=require('bs58');const kp=JSON.parse(fs.readFileSync('relayer-keypair.json'));console.log(bs58.encode(kp))"
   ```

6. **Fund the relayer wallet** with SOL for transaction fees:
   ```bash
   solana airdrop 1 <RELAYER_PUBLIC_KEY> --url devnet
   ```

7. **Deploy** - Render will automatically deploy on git push

### Option B: Railway

1. **Create new project** on Railway
2. **Add GitHub repository**
3. **Set root directory** to `relayer`
4. **Configure environment variables** (same as Render)
5. **Deploy**

### Option C: Self-Hosted (VPS/Docker)

1. **Clone repository** on your server
2. **Install dependencies:**
   ```bash
   cd relayer
   npm install --production
   ```

3. **Create `.env` file:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Generate and configure keypair:**
   ```bash
   solana-keygen new -o relayer-keypair.json
   # Fund the wallet with SOL
   ```

5. **Start with PM2 or systemd:**
   ```bash
   # PM2
   pm2 start npm --name "solvrn-relayer" -- start
   pm2 save
   pm2 startup
   
   # Or systemd (create service file)
   ```

### Relayer Health Check

After deployment, verify the relayer is running:

```bash
curl https://your-relayer.onrender.com/health
# Should return: { "status": "ok" }
```

## 2. Frontend Deployment

The frontend is a React/Vite application that can be deployed to any static hosting service.

### Option A: Vercel (Recommended)

1. **Import project** on Vercel
2. **Set root directory** to `frontend`
3. **Configure build settings:**
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Set Environment Variables:**
   ```
   VITE_RELAYER_URL=https://your-relayer.onrender.com
   VITE_HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
   VITE_PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
   VITE_ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
   VITE_THRESHOLD_REQ=51
   VITE_QUORUM_REQ=10
   ```

5. **Deploy** - Vercel will automatically deploy on git push

### Option B: Netlify

1. **Add new site** from Git
2. **Set build settings:**
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`

3. **Set environment variables** (same as Vercel)
4. **Deploy**

### Option C: Static Hosting (GitHub Pages, Cloudflare Pages)

1. **Build locally:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Upload `dist/` folder** to your hosting service
3. **Configure environment variables** in your hosting platform's dashboard

## 3. Environment Variables Reference

### Relayer Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `HELIUS_RPC_URL` | Solana RPC endpoint | Yes | `https://api.devnet.solana.com` |
| `PROGRAM_ID` | Solvrn program ID | Yes | `AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv` |
| `ARCIUM_PROGRAM_ID` | Arcium MPC program ID | Yes | `DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS` |
| `PORT` | Server port | No | `3000` |
| `NODE_ENV` | Environment | No | `development` |
| `RELAYER_KEYPAIR` | Base58-encoded secret key | Yes* | - |
| `RELAYER_KEYPAIR_PATH` | Path to keypair file | No | `./relayer-keypair.json` |

*Required: Either `RELAYER_KEYPAIR` env var or `relayer-keypair.json` file

### Frontend Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_RELAYER_URL` | Relayer API URL | Yes | `http://localhost:3000` |
| `VITE_HELIUS_RPC_URL` | Solana RPC endpoint | Yes | `https://api.devnet.solana.com` |
| `VITE_PROGRAM_ID` | Solvrn program ID | Yes | `AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv` |
| `VITE_ARCIUM_PROGRAM_ID` | Arcium MPC program ID | Yes | `DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS` |
| `VITE_THRESHOLD_REQ` | Voting threshold % | No | `51` |
| `VITE_QUORUM_REQ` | Minimum votes required | No | `10` |

## 4. Security Checklist

- [ ] Relayer keypair is **NOT** committed to git
- [ ] Environment variables are set in deployment platform (not in code)
- [ ] `.env` files are in `.gitignore`
- [ ] Relayer wallet is funded with SOL for transaction fees
- [ ] CORS is configured correctly (relayer allows frontend origin)
- [ ] HTTPS is enabled for both relayer and frontend
- [ ] Rate limiting is configured (if needed)

## 5. Post-Deployment Verification

### Test Relayer

```bash
# Health check
curl https://your-relayer.onrender.com/health

# Get next proposal ID
curl https://your-relayer.onrender.com/next-proposal-id
```

### Test Frontend

1. Visit your frontend URL
2. Connect wallet (Phantom/Solflare)
3. Create a test proposal
4. Cast a vote
5. Verify transactions appear on Solana explorer

## 6. Troubleshooting

### Relayer Issues

**Error: "Relayer keypair not found"**
- Ensure `RELAYER_KEYPAIR` env var is set OR `relayer-keypair.json` exists
- Check file permissions

**Error: "Insufficient funds"**
- Fund the relayer wallet with SOL
- Check balance: `solana balance <RELAYER_PUBLIC_KEY> --url devnet`

**Error: "Connection refused"**
- Verify RPC URL is correct
- Check if Helius API key is valid
- Ensure network allows outbound connections

### Frontend Issues

**Error: "Failed to fetch"**
- Verify `VITE_RELAYER_URL` points to deployed relayer
- Check CORS configuration on relayer
- Verify relayer is running and accessible

**Error: "SDK initialization failed"**
- Check browser console for WASM loading errors
- Verify HTTPS is enabled (required for WASM)
- Check network tab for failed resource loads

## 7. Production Considerations

### Relayer

- **Scaling**: Use a process manager (PM2) or container orchestration
- **Monitoring**: Set up health checks and alerting
- **Logging**: Configure structured logging (Winston, Pino)
- **Backup**: Regularly backup snapshot database
- **Updates**: Use blue-green deployment for zero downtime

### Frontend

- **CDN**: Use Cloudflare or similar for global distribution
- **Caching**: Configure cache headers for static assets
- **Analytics**: Add error tracking (Sentry) and analytics
- **Performance**: Monitor Core Web Vitals

## 8. Maintenance

### Regular Tasks

- Monitor relayer wallet balance (top up SOL as needed)
- Check for SDK updates: `npm outdated solvrn-sdk`
- Review error logs weekly
- Update dependencies monthly (security patches)

### Updating

1. **Relayer**: Pull latest code, rebuild, redeploy
2. **Frontend**: Pull latest code, rebuild, redeploy
3. **SDK**: Update `package.json` and redeploy frontend

---

For issues or questions, open an issue on GitHub or contact the team.
