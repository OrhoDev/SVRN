# Quick Deployment Guide

## 🚀 Step-by-Step Deployment

### **PART 1: Deploy Relayer (Render.com)**

#### 1. Create Render Account & Service
- Go to https://render.com
- Sign up/login
- Click **"New +"** → **"Web Service"**
- Connect your GitHub repository: `OrhoDev/SVRN`
- Select the repository

#### 2. Configure Build Settings
- **Name**: `solvrn-relayer`
- **Root Directory**: `relayer`
- **Environment**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Plan**: Free (or Starter for better performance)

#### 3. Set Environment Variables
Click **"Environment"** tab and add:

```
NODE_ENV=production
PORT=10000
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
ARCIUM_CLUSTER_OFFSET=456
RELAYER_KEYPAIR=2iFJAMvuj7Kn38GkKv7Hu53sekpEVwTSabSQx342pmNcbrE5PdsdD4WEhm6Rh6SftL5uLVY4ssdXUj7bfLtaNZPk
```

**⚠️ IMPORTANT**: Replace `HELIUS_RPC_URL` with your own Helius API key if you have one (get free key at https://helius.dev)

#### 4. Deploy
- Click **"Create Web Service"**
- Wait for build to complete (~2-3 minutes)
- Copy the URL (e.g., `https://solvrn-relayer.onrender.com`)

#### 5. Verify Relayer
```bash
curl https://your-relayer-url.onrender.com/health
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

**⚠️ IMPORTANT**: Replace `VITE_RELAYER_URL` with your actual Render relayer URL!

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
- Double-check `RELAYER_KEYPAIR` env var is set correctly
- Make sure there are no extra spaces or quotes

**"Insufficient funds"**
- Fund the relayer wallet: `solana airdrop 1 AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L --url devnet`

**"Connection refused"**
- Verify `HELIUS_RPC_URL` is correct
- Check Render logs for errors

### Frontend Issues

**"Failed to fetch"**
- Verify `VITE_RELAYER_URL` matches your Render URL exactly
- Check CORS settings (relayer should allow all origins in dev mode)
- Check browser console for specific errors

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

