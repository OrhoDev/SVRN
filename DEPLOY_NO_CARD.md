# Deployment Guide (No Credit Card Required)

## 🎯 Strategy: Use Free Services That Don't Require Cards

### **Option 1: Railway.app (Relayer) + Vercel (Frontend)** ⭐ RECOMMENDED

Railway.app offers free tier without requiring a credit card initially.

#### **PART 1: Deploy Relayer on Railway**

1. **Sign up**: Go to https://railway.app
   - Sign up with GitHub (free tier available)
   - No credit card required initially

2. **Create New Project**:
   - Click **"New Project"**
   - Select **"Deploy from GitHub repo"**
   - Choose `OrhoDev/SVRN`

3. **Configure Service**:
   - Railway auto-detects it's a Node.js project
   - Click on the service → **"Settings"**
   - Set **Root Directory**: `relayer`
   - Set **Start Command**: `npm start`

4. **Set Environment Variables**:
   - Go to **"Variables"** tab
   - Add these (click **"New Variable"** for each):
   
   ```
   NODE_ENV=production
   PORT=10000
   HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
   PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
   ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
   ARCIUM_CLUSTER_OFFSET=456
   RELAYER_KEYPAIR=2iFJAMvuj7Kn38GkKv7Hu53sekpEVwTSabSQx342pmNcbrE5PdsdD4WEhm6Rh6SftL5uLVY4ssdXUj7bfLtaNZPk
   ```

5. **Deploy**:
   - Railway auto-deploys on git push
   - Or click **"Deploy"** manually
   - Wait for build (~2-3 minutes)
   - Copy the generated URL (e.g., `https://svrn-relayer-production.up.railway.app`)

6. **Generate Public URL**:
   - Click **"Settings"** → **"Networking"**
   - Click **"Generate Domain"** to get a public URL

7. **Fund Relayer Wallet**:
   ```bash
   solana airdrop 1 AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L --url devnet
   ```

---

### **Option 2: Fly.io (Relayer) + Vercel (Frontend)**

Fly.io has a generous free tier.

#### **PART 1: Deploy Relayer on Fly.io**

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Sign up**:
   ```bash
   fly auth signup
   # Or: fly auth login
   ```

3. **Create App**:
   ```bash
   cd /home/dev0/SVRN/relayer
   fly launch --name solvrn-relayer --region ord
   ```
   - Choose **"No"** to copying config
   - Choose **"No"** to Postgres
   - Choose **"No"** to Redis

4. **Create `fly.toml`**:
   ```bash
   cat > fly.toml << 'EOF'
   app = "solvrn-relayer"
   primary_region = "ord"
   
   [build]
   
   [env]
     NODE_ENV = "production"
     PORT = "10000"
     HELIUS_RPC_URL = "https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db"
     PROGRAM_ID = "AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv"
     ARCIUM_PROGRAM_ID = "DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS"
     ARCIUM_CLUSTER_OFFSET = "456"
     RELAYER_KEYPAIR = "2iFJAMvuj7Kn38GkKv7Hu53sekpEVwTSabSQx342pmNcbrE5PdsdD4WEhm6Rh6SftL5uLVY4ssdXUj7bfLtaNZPk"
   
   [[services]]
     internal_port = 10000
     protocol = "tcp"
     
     [[services.ports]]
       port = 80
       handlers = ["http"]
       force_https = true
     
     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]
   EOF
   ```

5. **Deploy**:
   ```bash
   fly deploy
   ```

6. **Get URL**:
   ```bash
   fly status
   # URL will be: https://solvrn-relayer.fly.dev
   ```

---

### **Option 3: Self-Hosted (Free VPS)**

Use a free VPS service:

#### **Services Offering Free VPS:**
- **Oracle Cloud Free Tier**: 2 VMs, 24GB RAM (permanent free tier)
- **Google Cloud Free Tier**: $300 credit for 90 days
- **AWS Free Tier**: 12 months free
- **Azure Free Tier**: $200 credit for 30 days

#### **Quick Setup (Oracle Cloud)**:

1. **Sign up**: https://www.oracle.com/cloud/free/
2. **Create VM**: Ubuntu 22.04, 1 OCPU, 1GB RAM (always free)
3. **SSH into VM**:
   ```bash
   ssh ubuntu@<your-vm-ip>
   ```

4. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

5. **Clone & Setup**:
   ```bash
   git clone https://github.com/OrhoDev/SVRN.git
   cd SVRN/relayer
   npm install --production
   ```

6. **Create `.env`**:
   ```bash
   cat > .env << 'EOF'
   NODE_ENV=production
   PORT=10000
   HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
   PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
   ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
   ARCIUM_CLUSTER_OFFSET=456
   RELAYER_KEYPAIR=2iFJAMvuj7Kn38GkKv7Hu53sekpEVwTSabSQx342pmNcbrE5PdsdD4WEhm6Rh6SftL5uLVY4ssdXUj7bfLtaNZPk
   EOF
   ```

7. **Install PM2**:
   ```bash
   sudo npm install -g pm2
   pm2 start npm --name "solvrn-relayer" -- start
   pm2 save
   pm2 startup  # Follow instructions to enable auto-start
   ```

8. **Open Firewall**:
   ```bash
   sudo ufw allow 10000/tcp
   ```

9. **Access**: `http://<your-vm-ip>:10000`

---

### **PART 2: Deploy Frontend (Vercel - No Card Needed)** ✅

Vercel doesn't require a credit card for frontend hosting!

1. **Go to**: https://vercel.com
2. **Sign up** with GitHub (free)
3. **Import Project**: `OrhoDev/SVRN`
4. **Settings**:
   - Root Directory: `frontend`
   - Framework: Vite (auto-detected)
5. **Environment Variables**:
   ```
   VITE_RELAYER_URL=https://your-relayer-url  ← Use Railway/Fly.io/VM URL
   VITE_HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
   VITE_PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
   VITE_ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
   VITE_THRESHOLD_REQ=51
   VITE_QUORUM_REQ=10
   ```
6. **Deploy** - Done! 🎉

---

## 🎯 **Recommended: Railway + Vercel**

**Why Railway?**
- ✅ No credit card required initially
- ✅ Free tier: $5/month credit
- ✅ Auto-deploys from GitHub
- ✅ Easy environment variable management
- ✅ Built-in HTTPS

**Why Vercel?**
- ✅ No credit card required
- ✅ Free tier is generous
- ✅ Perfect for frontend hosting
- ✅ Auto-deploys from GitHub
- ✅ Global CDN included

---

## ⚠️ **Important Notes**

1. **Railway Free Tier**: 
   - $5/month credit (usually enough for a small relayer)
   - May require card after free credit expires
   - But you can deploy without card initially

2. **Fly.io Free Tier**:
   - 3 shared VMs
   - 3GB persistent storage
   - 160GB outbound data transfer
   - No credit card required

3. **If Railway/Fly.io ask for card**:
   - Use Option 3 (Self-hosted Oracle Cloud)
   - Or use a prepaid card if available

---

## 🚀 **Quick Start (Railway + Vercel)**

1. **Railway**: Deploy relayer (5 min)
2. **Vercel**: Deploy frontend (3 min)
3. **Fund wallet**: `solana airdrop 1 AK3i9fk6t28qhq8UrmaWvAUDS2EcfC3566MSPZjnEv1L --url devnet`
4. **Test**: Visit Vercel URL and connect wallet

**Total time: ~10 minutes, $0 cost!**

