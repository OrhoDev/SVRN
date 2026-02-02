# Quick Deployment Guide

## 🚀 Step-by-Step Deployment

### **PART 1: Deploy Relayer (Fly.io - 7 Day Free Trial)**

#### 1. Install Fly.io CLI
```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Or download from: https://fly.io/docs/getting-started/installing-flyctl/
```

#### 2. Login to Fly.io
```bash
fly auth login
# Follow the browser prompt to authenticate
```

#### 3. Create Fly.io App
```bash
cd relayer
fly launch --no-deploy
# When prompted:
# - App name: solvrn-relayer (or choose your own)
# - Region: iad (Washington, D.C.) or choose closest
# - Don't deploy yet (we'll set env vars first)
```

#### 4. Set Environment Variables
```bash
fly secrets set NODE_ENV=production
fly secrets set PORT=10000
fly secrets set HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
fly secrets set PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
fly secrets set ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
fly secrets set ARCIUM_CLUSTER_OFFSET=456
fly secrets set RELAYER_KEYPAIR=2iFJAMvuj7Kn38GkKv7Hu53sekpEVwTSabSQx342pmNcbrE5PdsdD4WEhm6Rh6SftL5uLVY4ssdXUj7bfLtaNZPk
```

**⚠️ IMPORTANT**: Replace `HELIUS_RPC_URL` with your own Helius API key if you have one (get free key at https://helius.dev)

#### 5. Deploy
```bash
fly deploy
# Wait for build and deployment (~3-5 minutes)
```

#### 6. Get Your Relayer URL
```bash
fly status
# Look for the URL, e.g., https://solvrn-relayer.fly.dev
```

#### 7. Verify Relayer
```bash
curl https://your-app-name.fly.dev/health
# Should return: {"status":"ok","timestamp":"..."}
```

#### 6. Fund Relayer Wallet
The relayer wallet address is: `AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L`

Fund it with devnet SOL:
```bash
solana airdrop 1 AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L --url devnet
```

---

### **PART 2: Deploy Frontend (Vercel)**

#### 1. Create Vercel Account & Project
- Go to https://vercel.com
- Sign up/login with GitHub
- Click **"Add New..."** → **"Project"**
- Import repository: `OrhoDev/SVRN`

#### 2. Configure Project Settings
- **Framework Preset**: `Vite`
- **Root Directory**: `frontend` (click "Edit" and set to `frontend`)
- **Build Command**: `npm run build` (should auto-detect)
- **Output Directory**: `dist` (should auto-detect)

#### 3. Set Environment Variables
Click **"Environment Variables"** and add:

```
VITE_RELAYER_URL=https://your-relayer-url.onrender.com
VITE_HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
VITE_PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
VITE_ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
VITE_THRESHOLD_REQ=51
VITE_QUORUM_REQ=10
```

**⚠️ IMPORTANT**: Replace `VITE_RELAYER_URL` with your actual Fly.io relayer URL (e.g., `https://solvrn-relayer.fly.dev`)!

#### 4. Deploy
- Click **"Deploy"**
- Wait for build (~1-2 minutes)
- Copy the deployment URL (e.g., `https://svrn.vercel.app`)

#### 5. Test Frontend
1. Visit your Vercel URL
2. Connect wallet (Phantom/Solflare)
3. Create a test proposal
4. Cast a vote
5. Check Solana Explorer for transactions

---

## ✅ Post-Deployment Checklist

- [ ] Relayer health check returns `{"status":"ok"}`
- [ ] Relayer wallet has SOL balance (check: `solana balance AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L --url devnet`)
- [ ] Frontend loads without errors
- [ ] Wallet connection works
- [ ] Can create proposals
- [ ] Can cast votes
- [ ] Transactions appear on Solana Explorer

---

## 🔧 Troubleshooting

### Relayer Issues

**"Relayer keypair not found"**
- Double-check `RELAYER_KEYPAIR` secret is set correctly: `fly secrets list`
- Make sure there are no extra spaces or quotes
- Set it again: `fly secrets set RELAYER_KEYPAIR=your-keypair-here`

**"Insufficient funds"**
- Fund the relayer wallet: `solana airdrop 1 AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L --url devnet`

**"Connection refused"**
- Verify `HELIUS_RPC_URL` is correct: `fly secrets list`
- Check Fly.io logs: `fly logs`
- View app status: `fly status`

**"Build failed"**
- Check build logs: `fly logs --build`
- Ensure Dockerfile is in the `relayer/` directory
- Verify `package.json` has correct build scripts

### Frontend Issues

**"Failed to fetch"**
- Verify `VITE_RELAYER_URL` matches your Fly.io URL exactly (e.g., `https://solvrn-relayer.fly.dev`)
- Check CORS settings (relayer should allow all origins in dev mode)
- Check browser console for specific errors
- Verify Fly.io app is running: `fly status`

**"SDK initialization failed"**
- Ensure HTTPS is enabled (Vercel provides this automatically)
- Check browser console for WASM loading errors
- Try hard refresh (Ctrl+Shift+R)

---

## 📝 Quick Reference

**Relayer Wallet**: `AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L`  
**Program ID**: `AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv`  
**Arcium Program ID**: `DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS`

---

## 🎯 Next Steps

1. **Test the full flow**: Create proposal → Vote → Tally
2. **Monitor logs**: Check Render/Vercel logs for any errors
3. **Update README**: Add your deployment URLs to the README
4. **Share**: Your frontend URL is ready to demo!

---

**Need help?** Check `DEPLOYMENT.md` for more detailed information.

