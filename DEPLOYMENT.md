# SVRN Deployment Guide

## Overview
Deploy SVRN to production with Vercel (frontend) and Render (relayer).

## Environment Setup

### Frontend (Vercel)
1. **Install Vercel CLI**: `npm i -g vercel`
2. **Environment Variables**:
   ```
   VITE_RELAYER_URL=https://your-relayer.onrender.com
   VITE_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
   VITE_PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
   VITE_ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
   VITE_THRESHOLD_REQ=51
   VITE_QUORUM_REQ=10
   ```

### Relayer (Render)
1. **Environment Variables**:
   ```
   NODE_ENV=production
   PORT=10000
   HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=33302b90-c418-4607-a96c-6483d6cb55db
   PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv
   ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS
   JWT_SECRET=your-secret-key
   CORS_ORIGIN=https://your-frontend.vercel.app
   ```

## Deployment Steps

### 1. Deploy Relayer (Render)
```bash
cd relayer
# Install Render CLI or use web dashboard
# Connect GitHub repo
# Set environment variables
# Deploy!
```

### 2. Deploy Frontend (Vercel)
```bash
cd frontend
vercel --prod
# Set environment variables in Vercel dashboard
# Deploy!
```

## Security Checklist

### Done
- Environment variables configured
- Hardcoded secrets removed
- CORS properly configured
- Rate limiting enabled

### Important
- Keep relayer keypair.json secure
- Monitor API usage
- Set up error monitoring
- Use HTTPS everywhere

## Monitoring

### Render (Relayer)
- Built-in metrics dashboard
- Log streaming
- Error tracking

### Vercel (Frontend)
- Analytics dashboard
- Performance metrics
- Web Vitals

## CI/CD Pipeline

Both platforms support automatic deployments from GitHub:
1. Push to `main` branch → Auto-deploy to production
2. Push to `dev` branch → Auto-deploy to preview

## URLs After Deployment

- **Frontend**: `https://svrn-app.vercel.app`
- **Relayer**: `https://svrn-relayer.onrender.com`
- **Health Check**: `https://svrn-relayer.onrender.com/health`

## Troubleshooting

### Common Issues
1. **CORS errors**: Update CORS_ORIGIN in relayer
2. **WASM loading**: Ensure proper headers in vercel.json
3. **Memory issues**: Monitor Render memory usage
4. **API timeouts**: Check relayer logs

### Debug Commands
```bash
# Check relayer health
curl https://svrn-relayer.onrender.com/health

# Test frontend build locally
npm run build && npm run preview
```

## Scaling

### Free Tier Limits
- **Render**: 750 hours/month, 512MB RAM
- **Vercel**: 100GB bandwidth/month

### Upgrade Path
1. **Render Starter**: $7/month for better performance
2. **Vercel Pro**: $20/month for more bandwidth
3. **Custom domains**: Configure in both platforms

## Production Checklist

- [ ] Environment variables set
- [ ] HTTPS configured
- [ ] CORS properly set
- [ ] Error monitoring setup
- [ ] Rate limiting enabled
- [ ] Health checks working
- [ ] Domain names configured
- [ ] CI/CD pipeline active
- [ ] Backup strategy in place
