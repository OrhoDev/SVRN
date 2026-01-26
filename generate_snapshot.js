import { Barretenberg, Fr } from '@aztec/bb.js';
import fs from 'fs';
import { Buffer } from 'buffer';

// --- CONFIGURATION ---
// ⚠️ Update these with your real wallet addresses
const ELIGIBLE_VOTERS = [
    { pubkey: "AZesBUcWibfPn1omUmKxWjqbikmYDUK16X78SX995zSS", balance: 100 }, 
    { pubkey: "YOUR_WALLET_ADDRESS_HERE", balance: 1000 }, 
    { pubkey: "DUMMY_WALLET_2", balance: 75 },
    { pubkey: "DUMMY_WALLET_3", balance: 10 },
];

// Helper: Convert BigInt to a 32-byte Buffer (Big Endian)
// This ensures we feed bb.js exactly what it wants
function to32ByteBuffer(bigInt) {
    const hex = bigInt.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
}

async function main() {
    console.log("🌳 Generating Merkle Snapshot...");
    
    // 1. Initialize Barretenberg with 1 thread to avoid worker issues
    const bb = await Barretenberg.new({ threads: 1 });

    const leaves = [];
    const snapshotData = {};

    console.log(`   Processing ${ELIGIBLE_VOTERS.length} voters...`);

    for (const voter of ELIGIBLE_VOTERS) {
        // A. Derive Deterministic Secret
        const pubKeyBuffer = Buffer.from(voter.pubkey);
        let hashValue = 0n;
        const MOD = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n; 
        for (const byte of pubKeyBuffer) { 
            hashValue = (hashValue << 8n) + BigInt(byte); 
            hashValue = hashValue % MOD; 
        }

        // B. Create Fr Elements from Buffers (The Robust Way)
        // We use Fr.fromBuffer because it strictly enforces the object structure bb.js expects
        const secretFr = Fr.fromBuffer(to32ByteBuffer(hashValue));
        const balanceFr = Fr.fromBuffer(to32ByteBuffer(BigInt(voter.balance)));
        
        // C. Compute Pedersen Hash
        const leafFr = await bb.pedersenHash([secretFr, balanceFr]);
        
        leaves.push(leafFr); 
        
        snapshotData[voter.pubkey] = {
            secret: hashValue.toString(16), // Store as hex string for chainUtils
            balance: voter.balance,
            leaf: leafFr.toString(),
            index: leaves.length - 1
        };
    }

    // 4. Pad Tree to 8 leaves
    console.log("   Padding tree...");
    while (leaves.length < 8) {
        const zeroFr = Fr.fromBuffer(Buffer.alloc(32, 0));
        const leafFr = await bb.pedersenHash([zeroFr, zeroFr]);
        leaves.push(leafFr);
    }

    // 5. Build Tree
    const treeStrings = [leaves.map(l => l.toString())];
    let currentLevelFr = leaves;

    while (currentLevelFr.length > 1) {
        const nextLevelFr = [];
        const nextLevelStr = [];
        
        for (let i = 0; i < currentLevelFr.length; i += 2) {
            const left = currentLevelFr[i];
            const right = currentLevelFr[i+1];
            
            const parentFr = await bb.pedersenHash([left, right]);
            
            nextLevelFr.push(parentFr);
            nextLevelStr.push(parentFr.toString());
        }
        
        currentLevelFr = nextLevelFr;
        treeStrings.push(nextLevelStr);
    }

    const root = currentLevelFr[0].toString();
    
    // 6. Generate Paths
    console.log("   Generating inclusion paths...");
    for (const pubkey in snapshotData) {
        const idx = snapshotData[pubkey].index;
        const path = [];
        let currIdx = idx;
        
        for (let i = 0; i < 3; i++) { 
            const siblingIdx = currIdx % 2 === 0 ? currIdx + 1 : currIdx - 1;
            path.push(treeStrings[i][siblingIdx]);
            currIdx = Math.floor(currIdx / 2);
        }
        snapshotData[pubkey].path = path;
    }

    const output = {
        merkle_root: root,
        voters: snapshotData
    };

    if (!fs.existsSync('frontend/src')) {
        fs.mkdirSync('frontend/src', { recursive: true });
    }

    fs.writeFileSync('frontend/src/snapshot.json', JSON.stringify(output, null, 2));
    console.log(`✅ Snapshot saved to frontend/src/snapshot.json`);
    console.log(`🔑 Merkle Root: ${root}`);
}

main().catch(err => {
    console.error("FATAL ERROR:");
    console.error(err);
});