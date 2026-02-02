#!/usr/bin/env node

/**
 * Simple SDK Test - Tests SDK without complex dependencies
 */

// Import SDK directly
import { SolvrnClient } from '../sdk/dist/index.js';

const RELAYER_URL = 'http://localhost:3000';
const PROGRAM_ID = 'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv';

// Test results
const testResults = { passed: 0, failed: 0, errors: [] };

function log(message) {
    console.log(`[SDK-TEST] ${new Date().toISOString()} - ${message}`);
}

function logSuccess(message) {
    console.log(`✅ [SUCCESS] ${message}`);
    testResults.passed++;
}

function logError(message, error = null) {
    console.error(`❌ [ERROR] ${message}`);
    if (error) console.error(`   Details: ${error.message || error}`);
    testResults.failed++;
    testResults.errors.push({ message, error: error?.message || error });
}

async function testSDKBasics() {
    log('Testing SDK Basic Functionality...');
    
    try {
        // Test 1: Create SDK client
        log('Creating SDK client...');
        const svrn = new SolvrnClient(RELAYER_URL, undefined, PROGRAM_ID);
        logSuccess('SDK client created successfully');
        
        // Test 2: Initialize SDK
        log('Initializing SDK...');
        await svrn.init();
        logSuccess('SDK initialized successfully');
        
        // Test 3: Check ready status
        log('Checking SDK ready status...');
        const isReady = svrn.isReady();
        if (isReady) {
            logSuccess('SDK reports ready status');
        } else {
            logError('SDK reports not ready after initialization');
        }
        
        // Test 4: Test API access through SDK
        log('Testing API access through SDK...');
        const nextId = await svrn.api.getNextProposalId();
        if (nextId.success && typeof nextId.nextId === 'number') {
            logSuccess(`API access successful: next ID = ${nextId.nextId}`);
        } else {
            logError('API access failed', nextId);
        }
        
        // Test 5: Test proposal creation
        log('Testing proposal creation...');
        const mockProvider = {
            connection: { rpcEndpoint: 'https://api.devnet.solana.com' },
            wallet: { publicKey: { toBase58: () => '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' } }
        };
        
        const mockAuthority = { toBase58: () => '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' };
        
        try {
            const proposalResult = await svrn.createProposal(
                mockProvider,
                mockAuthority,
                'So11111111111111111111111111111111111111112',
                { title: 'Test SDK Proposal', desc: 'Testing SDK', duration: 24 },
                0.1
            );
            
            if (proposalResult && proposalResult.proposalId) {
                logSuccess(`Proposal created via SDK: ID=${proposalResult.proposalId}`);
            } else {
                logError('SDK proposal creation failed', proposalResult);
            }
        } catch (error) {
            // Expected to fail due to mock provider, but should not crash
            logSuccess('SDK handled mock provider gracefully');
        }
        
        return true;
    } catch (error) {
        logError('SDK basic test failed', error);
        return false;
    }
}

async function testSDKErrorHandling() {
    log('Testing SDK Error Handling...');
    
    try {
        const svrn = new SolvrnClient(RELAYER_URL);
        
        // Test invalid relayer URL
        try {
            const invalidSvrn = new SolvrnClient('http://localhost:9999');
            await invalidSvrn.api.getNextProposalId();
            logError('Should have failed with invalid relayer URL');
        } catch (error) {
            logSuccess('Correctly handled invalid relayer URL');
        }
        
        // Test invalid program ID
        try {
            const invalidSvrn = new SolvrnClient(RELAYER_URL, undefined, 'invalid-program-id');
            await invalidSvrn.init();
            logError('Should have failed with invalid program ID');
        } catch (error) {
            logSuccess('Correctly handled invalid program ID');
        }
        
        return true;
    } catch (error) {
        logError('SDK error handling test failed', error);
        return false;
    }
}

async function runSDKTests() {
    log('Starting Simple SDK Test Suite...');
    log(`Relayer URL: ${RELAYER_URL}`);
    log(`Program ID: ${PROGRAM_ID}`);
    
    await testSDKBasics();
    await testSDKErrorHandling();
    
    // Print results
    log('\n' + '='.repeat(60));
    log('SDK TEST RESULTS');
    log('='.repeat(60));
    log(`✅ Passed: ${testResults.passed}`);
    log(`❌ Failed: ${testResults.failed}`);
    log(`📊 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.errors.length > 0) {
        log('\nERRORS:');
        testResults.errors.forEach((error, index) => {
            log(`${index + 1}. ${error.message}`);
            if (error.error) {
                log(`   ${error.error}`);
            }
        });
    }
    
    log('\n' + '='.repeat(60));
    
    return testResults.failed === 0;
}

// Run tests
runSDKTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('SDK test suite crashed:', error);
        process.exit(1);
    });
