#!/bin/bash

echo "🚀 DEPLOYING UPDATED RELAYER TO PRODUCTION"
echo "=========================================="

# Step 1: Copy the built relayer to production
echo "Step 1: Copy index.js to production server..."
echo "scp index.js user@api.solvrn.xyz:/home/user/relayer/"

# Step 2: Restart the relayer service
echo "Step 2: Restart relayer on production..."
echo "ssh user@api.solvrn.xyz 'cd /home/user/relayer && pkill -f \"node index.js\" && nohup npm start > relayer.log 2>&1 &'"

# Step 3: Verify deployment
echo "Step 3: Verify deployment..."
echo "curl -s https://api.solvrn.xyz/health"

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "📋 What was deployed:"
echo "- Force-add creator logic in create-proposal"
echo "- /demo-add-creator endpoint"
echo "- Fixed TypeScript errors"
echo ""
echo "🧪 Next steps:"
echo "1. Create a NEW proposal (don't use old ones 100000, 100001, 100002)"
echo "2. Test the voting flow"
echo "3. Verify ZK proof generation works"
