#!/bin/bash
# Switch computation definition to off-chain storage
# Usage: ./scripts/switch_to_offchain.sh <IPFS_CID_OR_URL>

if [ -z "$1" ]; then
    echo "Usage: $0 <IPFS_CID_OR_URL>"
    echo "Example: $0 QmXXXXXXXXXXXXX"
    echo "Or: $0 https://ipfs.io/ipfs/QmXXXXXXXXXXXXX"
    exit 1
fi

IPFS_URL="$1"

# If it's just a CID, prepend the IPFS gateway
if [[ ! "$IPFS_URL" =~ ^https?:// ]]; then
    IPFS_URL="https://ipfs.io/ipfs/$IPFS_URL"
fi

LIB_RS="programs/svrn_engine/src/lib.rs"

echo "🔄 Switching to off-chain storage..."
echo "   IPFS URL: $IPFS_URL"
echo ""

# Check if circuit_hash! macro is available
if ! grep -q "circuit_hash!" "$LIB_RS"; then
    echo "📝 Updating lib.rs to use off-chain storage..."
    
    # Read the circuit file to compute hash
    CIRCUIT_FILE="build/add_together.arcis"
    if [ ! -f "$CIRCUIT_FILE" ]; then
        echo "❌ Circuit file not found. Run: arcium build"
        exit 1
    fi
    
    # Compute SHA-256 hash (required for circuit_hash! macro)
    if command -v sha256sum &> /dev/null; then
        CIRCUIT_HASH=$(sha256sum "$CIRCUIT_FILE" | cut -d' ' -f1)
    elif command -v shasum &> /dev/null; then
        CIRCUIT_HASH=$(shasum -a 256 "$CIRCUIT_FILE" | cut -d' ' -f1)
    else
        echo "⚠️  Cannot compute hash automatically. You'll need to:"
        echo "   1. Compute SHA-256 of $CIRCUIT_FILE"
        echo "   2. Use circuit_hash! macro with the hash"
        CIRCUIT_HASH=""
    fi
    
    if [ -n "$CIRCUIT_HASH" ]; then
        echo "   Circuit hash: $CIRCUIT_HASH"
    fi
    
    # Update the init_comp_def call
    # For off-chain: init_comp_def(ctx.accounts, Some(circuit_source), Some(offchain_source))
    # We need to use circuit_hash! macro and provide the URL
    
    echo ""
    echo "⚠️  Manual update required:"
    echo "   1. Add: use arcium_macros::circuit_hash;"
    echo "   2. Update init_comp_def to:"
    echo "      init_comp_def("
    echo "          ctx.accounts,"
    echo "          Some(CircuitSource::OffChain {"
    echo "              source: \"$IPFS_URL\".to_string(),"
    if [ -n "$CIRCUIT_HASH" ]; then
        echo "              hash: circuit_hash!(\"$CIRCUIT_HASH\"),"
    else
        echo "              hash: circuit_hash!(\"<COMPUTE_SHA256_HASH>\"),"
    fi
    echo "          }),"
    echo "          None,"
    echo "      )?;"
    echo ""
    echo "   Or see Arcium docs for exact syntax"
else
    echo "✅ circuit_hash! macro already present"
fi

echo ""
echo "📋 Next steps after updating code:"
echo "   1. Rebuild: cd svrn_engine && arcium build && anchor build"
echo "   2. Redeploy: anchor deploy --provider.cluster devnet"
echo "   3. Reinitialize: yarn run init-mxe"

