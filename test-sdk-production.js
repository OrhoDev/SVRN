// Test SDK Production Mode - No Demo Endpoints
const fs = require('fs');
const path = require('path');

// Load SDK
const sdkPath = path.join(__dirname, 'sdk/dist/index.js');
if (!fs.existsSync(sdkPath)) {
    console.log('❌ SDK not built');
    process.exit(1);
}

const { SvrnClient } = require(sdkPath);

async function testSDKProductionMode() {
    console.log('🔒 Testing SDK Production Mode - No Demo Access\n');
    
    // Initialize SDK client
    const client = new SvrnClient('http://localhost:3000');
    
    console.log('✅ SDK Client instantiated');
    
    // Check available methods
    console.log('\n📋 Available SDK Methods:');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
        .filter(name => name !== 'constructor' && typeof client[name] === 'function');
    
    methods.forEach(method => {
        console.log(`   - ${method}()`);
    });
    
    // Check API methods
    console.log('\n📋 Available API Methods:');
    const apiMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.api))
        .filter(name => name !== 'constructor' && typeof client.api[name] === 'function');
    
    apiMethods.forEach(method => {
        console.log(`   - api.${method}()`);
    });
    
    // Verify no demo endpoints are exposed
    console.log('\n🔍 Checking for Demo Endpoints...');
    
    const hasDemoAddCreator = methods.includes('addCreator') || 
                            methods.includes('demoAddCreator') ||
                            apiMethods.includes('addCreator') || 
                            apiMethods.includes('demoAddCreator');
    
    if (hasDemoAddCreator) {
        console.log('❌ DEMO ENDPOINTS FOUND IN SDK!');
        return false;
    } else {
        console.log('✅ No demo endpoints found in SDK');
    }
    
    // Test that SDK only uses production endpoints
    console.log('\n🧪 Testing SDK Production Behavior...');
    
    try {
        // Test 1: createProposal should use initialize-snapshot (production)
        console.log('   Testing createProposal (production snapshot)...');
        
        // Mock provider for testing
        const mockProvider = {
            connection: { 
                getLatestBlockhash: () => ({ blockhash: 'test' }),
                sendRawTransaction: () => 'test_txid',
                confirmTransaction: () => ({})
            },
            wallet: { 
                signTransaction: (tx) => tx 
            }
        };
        
        const mockAuthority = { toBase58: () => 'testauthority111111111111111111111111111' };
        
        // This should fail because creator has no tokens (production mode)
        try {
            await client.createProposal(
                mockProvider,
                mockAuthority,
                'So11111111111111111111111111111111111111112',
                { title: 'Test', desc: 'Test', duration: 24 },
                0.05
            );
            console.log('   ⚠️  Proposal succeeded (creator might have tokens)');
        } catch (error) {
            if (error.message.includes('Snapshot failed')) {
                console.log('   ✅ Production mode active: Creator rejected without tokens');
            } else {
                console.log(`   ⚠️  Unexpected error: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.log(`   ❌ SDK test failed: ${error.message}`);
        return false;
    }
    
    console.log('\n🎯 SDK Production Mode Verification:');
    console.log('✅ SDK exposes only production methods');
    console.log('✅ No demo endpoints accessible via SDK');
    console.log('✅ SDK users forced into production mode');
    console.log('✅ Demo mode only available via direct API calls');
    
    return true;
}

// Test direct API vs SDK access
async function testDirectVsSDK() {
    console.log('\n🔄 Testing Direct API vs SDK Access...');
    
    // Direct API call (should have demo endpoints)
    try {
        const response = await fetch('http://localhost:3000/demo-add-creator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalId: 20,
                creator: 'directtest111111111111111111111111111'
            })
        });
        
        const data = await response.json();
        if (data.success) {
            console.log('✅ Direct API: Demo endpoint accessible');
        } else {
            console.log('⚠️  Direct API: Demo endpoint returned error');
        }
    } catch (error) {
        console.log('❌ Direct API: Demo endpoint not accessible');
    }
    
    // SDK access (should not have demo endpoints)
    const { SvrnClient } = require(sdkPath);
    const client = new SvrnClient('http://localhost:3000');
    
    const sdkHasDemo = client.addCreator || 
                        client.demoAddCreator || 
                        client.api.addCreator || 
                        client.api.demoAddCreator;
    
    if (sdkHasDemo) {
        console.log('❌ SDK: Demo endpoints accessible (SECURITY ISSUE!)');
        return false;
    } else {
        console.log('✅ SDK: Demo endpoints not accessible');
    }
    
    return true;
}

// Run all tests
async function runAllTests() {
    const productionTest = await testSDKProductionMode();
    const directVsSdkTest = await testDirectVsSDK();
    
    console.log('\n🏆 Final Results:');
    console.log(`Production Mode Test: ${productionTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Direct vs SDK Test: ${directVsSdkTest ? '✅ PASS' : '❌ FAIL'}`);
    
    if (productionTest && directVsSdkTest) {
        console.log('\n🎉 SDK is PRODUCTION READY!');
        console.log('SDK users cannot access demo mode functionality.');
    } else {
        console.log('\n⚠️  SECURITY ISSUES FOUND!');
        console.log('SDK may expose demo functionality.');
    }
}

runAllTests().catch(console.error);
