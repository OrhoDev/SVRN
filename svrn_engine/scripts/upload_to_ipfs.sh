#!/bin/bash
# Upload circuit to IPFS using web3.storage (free, no auth required for small files)
# Alternative: Use Pinata, nft.storage, or any IPFS service

CIRCUIT_FILE="build/add_together.arcis"

if [ ! -f "$CIRCUIT_FILE" ]; then
    echo "❌ Circuit file not found: $CIRCUIT_FILE"
    echo "   Run: arcium build"
    exit 1
fi

echo "📤 Uploading circuit to IPFS..."
echo "   File: $CIRCUIT_FILE"
echo "   Size: $(du -h "$CIRCUIT_FILE" | cut -f1)"
echo ""

# Option 1: Using web3.storage (requires npm package)
if command -v npx &> /dev/null; then
    echo "Using web3.storage via npx..."
    # Note: This requires @web3-storage/w3up-client or similar
    # For now, we'll provide manual instructions
    echo "⚠️  Automatic upload not configured"
    echo ""
    echo "📋 Manual Upload Options:"
    echo "   1. web3.storage: https://web3.storage (free, no auth)"
    echo "   2. Pinata: https://pinata.cloud (free tier available)"
    echo "   3. nft.storage: https://nft.storage (free)"
    echo "   4. IPFS Desktop: https://docs.ipfs.tech/install/ipfs-desktop/"
    echo ""
    echo "   After uploading, you'll get a CID or URL like:"
    echo "   - CID: QmXXXXXXXXXXXXX"
    echo "   - URL: https://ipfs.io/ipfs/QmXXXXXXXXXXXXX"
    echo ""
    echo "   Then run: ./scripts/switch_to_offchain.sh <CID_OR_URL>"
else
    echo "❌ npx not found. Please install Node.js or upload manually."
    echo ""
    echo "📋 Manual Upload Instructions:"
    echo "   1. Go to https://web3.storage"
    echo "   2. Upload: $CIRCUIT_FILE"
    echo "   3. Copy the CID or URL"
    echo "   4. Run: ./scripts/switch_to_offchain.sh <CID_OR_URL>"
fi

