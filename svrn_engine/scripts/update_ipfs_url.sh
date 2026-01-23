#!/bin/bash
# Helper script to update IPFS URL in lib.rs after uploading circuit file
# Usage: ./scripts/update_ipfs_url.sh <NEW_IPFS_CID_OR_URL>

if [ -z "$1" ]; then
    echo "Usage: $0 <NEW_IPFS_CID_OR_URL>"
    echo "Example: $0 QmNewHashHere"
    echo "Or: $0 https://ipfs.io/ipfs/QmNewHashHere"
    exit 1
fi

NEW_URL="$1"
# If it's just a CID, prepend the IPFS gateway
if [[ ! "$NEW_URL" =~ ^https?:// ]]; then
    NEW_URL="https://ipfs.io/ipfs/$NEW_URL"
fi

LIB_RS="programs/svrn_engine/src/lib.rs"

# Update the IPFS URL in lib.rs
sed -i "s|source: \"https://ipfs.io/ipfs/[^\"]*\"|source: \"$NEW_URL\"|" "$LIB_RS"

echo "✅ Updated IPFS URL in $LIB_RS"
echo "   New URL: $NEW_URL"
echo ""
echo "Next steps:"
echo "1. Rebuild: arcium build && anchor build"
echo "2. Redeploy: anchor deploy --provider.cluster devnet"
echo "3. Initialize: yarn run init-mxe"

