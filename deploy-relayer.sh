#!/bin/bash

echo "🚀 Deploying updated relayer to production..."

# Build the relayer
npm run build

echo "✅ Build complete"
echo ""
echo "📋 Manual deployment steps:"
echo "1. Copy index.js to production server:"
echo "   scp index.js user@api.solvrn.xyz:/home/user/relayer/"
echo ""
echo "2. Restart the relayer on production:"
echo "   ssh user@api.solvrn.xyz 'cd /home/user/relayer && pkill -f \"node index.js\" && nohup npm start > relayer.log 2>&1 &'"
echo ""
echo "3. Verify deployment:"
echo "   curl -s https://api.solvrn.xyz/health"
echo ""
echo "🎯 The updated relayer includes:"
echo "- Force-add creator logic in create-proposal"
echo "- /demo-add-creator endpoint"
echo "- Fixed TypeScript errors"
