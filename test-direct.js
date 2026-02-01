// Direct API testing without any dependencies
const RELAYER_URL = "http://localhost:3000";

async function testDirectAPI() {
    console.log("🚀 Direct API Testing - No Dependencies\n");
    
    // Test 1: Health check - try to reach the server
    console.log("1️⃣ Testing Server Connection...");
    try {
        const response = await fetch(RELAYER_URL);
        console.log("   Status:", response.status);
        console.log("   Server is:", response.ok ? "✅ Online" : "❌ Issue");
    } catch (error) {
        console.log("   ❌ Server connection failed:", error.message);
        return;
    }
    
    // Test 2: Get next proposal ID
    console.log("\n2️⃣ Testing GET /next-proposal-id...");
    try {
        const response = await fetch(`${RELAYER_URL}/next-proposal-id`);
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    // Test 3: Initialize snapshot (create proposal)
    console.log("\n3️⃣ Testing POST /initialize-snapshot...");
    try {
        const snapshotData = {
            proposalId: 1,
            votingMint: "So11111111111111111111111111111111111111112",
            metadata: { 
                title: "Test Proposal", 
                desc: "Direct API Test", 
                duration: 24 
            },
            creator: "11111111111111111111111111111112"
        };
        
        const response = await fetch(`${RELAYER_URL}/initialize-snapshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshotData)
        });
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    // Test 4: Get proposal details
    console.log("\n4️⃣ Testing GET /proposal/1...");
    try {
        const response = await fetch(`${RELAYER_URL}/proposal/1`);
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    // Test 5: Get merkle proof
    console.log("\n5️⃣ Testing POST /get-proof...");
    try {
        const proofData = {
            proposalId: 1,
            userPubkey: "11111111111111111111111111111112"
        };
        
        const response = await fetch(`${RELAYER_URL}/get-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proofData)
        });
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    // Test 6: Get vote counts
    console.log("\n6️⃣ Testing GET /vote-counts/1...");
    try {
        const response = await fetch(`${RELAYER_URL}/vote-counts/1`);
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    // Test 7: Demo add creator
    console.log("\n7️⃣ Testing POST /demo-add-creator...");
    try {
        const creatorData = {
            proposalId: 1,
            creator: "22222222222222222222222222222222"
        };
        
        const response = await fetch(`${RELAYER_URL}/demo-add-creator`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creatorData)
        });
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    // Test 8: Generate tally proof
    console.log("\n8️⃣ Testing POST /prove-tally...");
    try {
        const tallyData = {
            proposalId: 1,
            yesVotes: 10,
            noVotes: 5,
            threshold: 51,
            quorum: 10
        };
        
        const response = await fetch(`${RELAYER_URL}/prove-tally`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tallyData)
        });
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    // Test 9: Admin reset
    console.log("\n9️⃣ Testing POST /admin/reset-proposals...");
    try {
        const response = await fetch(`${RELAYER_URL}/admin/reset-proposals`, {
            method: 'POST'
        });
        const data = await response.json();
        console.log("   Status:", response.status);
        console.log("   Response:", data);
    } catch (error) {
        console.log("   ❌ Failed:", error.message);
    }
    
    console.log("\n🎉 Direct API Testing Complete!");
}

// Test file structure
function testFileStructure() {
    console.log("\n📁 Testing File Structure...");
    
    const fs = require('fs');
    const path = require('path');
    
    const criticalFiles = [
        'relayer/index.ts',
        'relayer/package.json',
        'relayer/tally.json',
        'sdk/dist/index.js',
        'sdk/dist/index.d.ts',
        'frontend/src/App.jsx',
        'frontend/circuit/target/circuit.json',
        'contracts/programs/solvote_chain/src/lib.rs'
    ];
    
    for (const file of criticalFiles) {
        const exists = fs.existsSync(path.join(__dirname, file));
        console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    }
    
    // Check relayer package.json for scripts
    try {
        const relayerPackage = JSON.parse(fs.readFileSync(path.join(__dirname, 'relayer/package.json'), 'utf8'));
        console.log("   ✅ Relayer scripts:", Object.keys(relayerPackage.scripts || {}));
    } catch (error) {
        console.log("   ❌ Could not read relayer package.json");
    }
    
    // Check SDK package.json
    try {
        const sdkPackage = JSON.parse(fs.readFileSync(path.join(__dirname, 'sdk/package.json'), 'utf8'));
        console.log("   ✅ SDK info:", {
            name: sdkPackage.name,
            version: sdkPackage.version,
            main: sdkPackage.main
        });
    } catch (error) {
        console.log("   ❌ Could not read SDK package.json");
    }
}

// Run all tests
async function runTests() {
    await testDirectAPI();
    testFileStructure();
}

runTests().catch(console.error);
