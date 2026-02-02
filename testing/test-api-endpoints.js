#!/usr/bin/env node

/**
 * API Endpoint Test Suite
 * Tests all relayer API endpoints directly
 */

const RELAYER_URL = 'http://localhost:3000';

// Test results tracking
const testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

function log(message) {
    console.log(`[API-TEST] ${new Date().toISOString()} - ${message}`);
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

async function testHealthEndpoint() {
    log('Testing Health Endpoint...');
    
    try {
        const response = await fetch(`${RELAYER_URL}/health`);
        const data = await response.json();
        
        if (response.ok && data.status === 'ok') {
            logSuccess(`Health check passed: ${JSON.stringify(data)}`);
            return true;
        } else {
            logError('Health endpoint failed', data);
            return false;
        }
    } catch (error) {
        logError('Health endpoint error', error);
        return false;
    }
}

async function testNextProposalId() {
    log('Testing Next Proposal ID Endpoint...');
    
    try {
        const response = await fetch(`${RELAYER_URL}/next-proposal-id`);
        const data = await response.json();
        
        if (response.ok && data.success && typeof data.nextId === 'number') {
            logSuccess(`Next proposal ID: ${data.nextId}`);
            return data.nextId;
        } else {
            logError('Next proposal ID failed', data);
            return null;
        }
    } catch (error) {
        logError('Next proposal ID error', error);
        return null;
    }
}

async function testGetAllProposals() {
    log('Testing Get All Proposals Endpoint...');
    
    try {
        const response = await fetch(`${RELAYER_URL}/proposals`);
        const data = await response.json();
        
        if (response.ok && data.success && Array.isArray(data.proposals)) {
            logSuccess(`Found ${data.proposals.length} proposals`);
            return data.proposals;
        } else {
            logError('Get all proposals failed', data);
            return null;
        }
    } catch (error) {
        logError('Get all proposals error', error);
        return null;
    }
}

async function testGetActiveProposals() {
    log('Testing Get Active Proposals Endpoint...');
    
    try {
        const response = await fetch(`${RELAYER_URL}/proposals/active`);
        const data = await response.json();
        
        if (response.ok && data.success && Array.isArray(data.proposals)) {
            logSuccess(`Found ${data.proposals.length} active proposals`);
            return data.proposals;
        } else {
            logError('Get active proposals failed', data);
            return null;
        }
    } catch (error) {
        logError('Get active proposals error', error);
        return null;
    }
}

async function testGetProposalsByMint() {
    log('Testing Get Proposals by Mint Endpoint...');
    
    const testMint = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
    
    try {
        const response = await fetch(`${RELAYER_URL}/proposals/by-mint/${testMint}`);
        const data = await response.json();
        
        if (response.ok && data.success && Array.isArray(data.proposals)) {
            logSuccess(`Found ${data.proposals.length} proposals for mint ${testMint}`);
            return data.proposals;
        } else {
            logError('Get proposals by mint failed', data);
            return null;
        }
    } catch (error) {
        logError('Get proposals by mint error', error);
        return null;
    }
}

async function testGetEligibleProposals() {
    log('Testing Get Eligible Proposals Endpoint...');
    
    const testWallet = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Random wallet
    
    try {
        const response = await fetch(`${RELAYER_URL}/proposals/eligible/${testWallet}`);
        const data = await response.json();
        
        if (response.ok && data.success && Array.isArray(data.proposals)) {
            logSuccess(`Found ${data.proposals.length} eligible proposals for wallet`);
            return data.proposals;
        } else {
            logError('Get eligible proposals failed', data);
            return null;
        }
    } catch (error) {
        logError('Get eligible proposals error', error);
        return null;
    }
}

async function testGetProposal(proposalId) {
    log(`Testing Get Proposal Endpoint for ID ${proposalId}...`);
    
    try {
        const response = await fetch(`${RELAYER_URL}/proposal/${proposalId}`);
        const data = await response.json();
        
        if (response.ok) {
            logSuccess(`Retrieved proposal ${proposalId}: ${JSON.stringify(data).substring(0, 100)}...`);
            return data;
        } else {
            logError(`Get proposal ${proposalId} failed`, data);
            return null;
        }
    } catch (error) {
        logError(`Get proposal ${proposalId} error`, error);
        return null;
    }
}

async function testCreateProposal() {
    log('Testing Create Proposal Endpoint...');
    
    const proposalData = {
        proposalId: Date.now(), // Use timestamp as unique ID
        votingMint: 'So11111111111111111111111111111111111111112',
        metadata: {
            title: 'Test API Proposal',
            desc: 'This is a test proposal created via API',
            duration: 24
        },
        creator: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        targetWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
    };
    
    try {
        const response = await fetch(`${RELAYER_URL}/create-proposal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proposalData)
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            logSuccess(`Proposal created: ID=${proposalData.proposalId}, TX=${data.tx}`);
            return proposalData.proposalId;
        } else {
            logError('Create proposal failed', data);
            return null;
        }
    } catch (error) {
        logError('Create proposal error', error);
        return null;
    }
}

async function testGetProof(proposalId) {
    log(`Testing Get Proof Endpoint for proposal ${proposalId}...`);
    
    const testWallet = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
    
    try {
        const response = await fetch(`${RELAYER_URL}/get-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalId: proposalId.toString(),
                userPubkey: testWallet
            })
        });
        const data = await response.json();
        
        if (response.ok && data.success && data.proof) {
            logSuccess(`Proof retrieved: root=${data.proof.root}, weight=${data.proof.weight}`);
            return data;
        } else {
            logError('Get proof failed', data);
            return null;
        }
    } catch (error) {
        logError('Get proof error', error);
        return null;
    }
}

async function testInitializeSnapshot(proposalId) {
    log(`Testing Initialize Snapshot Endpoint for proposal ${proposalId}...`);
    
    try {
        const response = await fetch(`${RELAYER_URL}/initialize-snapshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalId,
                votingMint: 'So11111111111111111111111111111111111111112',
                metadata: {
                    title: 'Test Snapshot',
                    desc: 'Testing snapshot initialization',
                    duration: 24
                },
                creator: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
            })
        });
        const data = await response.json();
        
        if (response.ok) {
            logSuccess(`Snapshot initialized: ${JSON.stringify(data).substring(0, 100)}...`);
            return data;
        } else {
            logError('Initialize snapshot failed', data);
            return null;
        }
    } catch (error) {
        logError('Initialize snapshot error', error);
        return null;
    }
}

async function testGetVoteCounts(proposalId) {
    log(`Testing Get Vote Counts Endpoint for proposal ${proposalId}...`);
    
    try {
        const response = await fetch(`${RELAYER_URL}/vote-counts/${proposalId}`);
        const data = await response.json();
        
        if (response.ok) {
            logSuccess(`Vote counts retrieved: ${JSON.stringify(data)}`);
            return data;
        } else {
            logError('Get vote counts failed', data);
            return null;
        }
    } catch (error) {
        logError('Get vote counts error', error);
        return null;
    }
}

async function testErrorEndpoints() {
    log('Testing Error Handling...');
    
    // Test invalid proposal ID
    try {
        const response = await fetch(`${RELAYER_URL}/proposal/-1`);
        if (response.ok) {
            logError('Should have failed with invalid proposal ID');
        } else {
            logSuccess('Correctly rejected invalid proposal ID');
        }
    } catch (error) {
        logSuccess('Correctly handled invalid proposal ID request');
    }
    
    // Test invalid endpoint
    try {
        const response = await fetch(`${RELAYER_URL}/invalid-endpoint`);
        if (response.ok) {
            logError('Should have failed with invalid endpoint');
        } else {
            logSuccess('Correctly rejected invalid endpoint');
        }
    } catch (error) {
        logSuccess('Correctly handled invalid endpoint request');
    }
    
    // Test invalid POST data
    try {
        const response = await fetch(`${RELAYER_URL}/get-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invalid: 'data' })
        });
        if (response.ok) {
            logError('Should have failed with invalid POST data');
        } else {
            logSuccess('Correctly rejected invalid POST data');
        }
    } catch (error) {
        logSuccess('Correctly handled invalid POST data request');
    }
}

async function runAllAPITests() {
    log('Starting Comprehensive API Test Suite...');
    log(`Relayer URL: ${RELAYER_URL}`);
    
    // Test 1: Health Check
    const healthOk = await testHealthEndpoint();
    if (!healthOk) {
        log('CRITICAL: Relayer is not responding, aborting remaining tests');
        return printResults();
    }
    
    // Test 2: Next Proposal ID
    const nextId = await testNextProposalId();
    
    // Test 3: Get All Proposals
    const allProposals = await testGetAllProposals();
    
    // Test 4: Get Active Proposals
    const activeProposals = await testGetActiveProposals();
    
    // Test 5: Get Proposals by Mint
    await testGetProposalsByMint();
    
    // Test 6: Get Eligible Proposals
    await testGetEligibleProposals();
    
    // Test 7: Create Proposal
    const createdProposalId = await testCreateProposal();
    
    // Test 8: Get Proposal (use existing or created)
    const proposalId = createdProposalId || (allProposals && allProposals.length > 0 ? allProposals[0].proposalId : nextId);
    if (proposalId) {
        await testGetProposal(proposalId);
        await testGetProof(proposalId);
        await testInitializeSnapshot(proposalId);
        await testGetVoteCounts(proposalId);
    } else {
        log('Skipping tests that require a valid proposal ID');
    }
    
    // Test 9: Error Handling
    await testErrorEndpoints();
    
    return printResults();
}

function printResults() {
    log('\n' + '='.repeat(60));
    log('API TEST SUITE RESULTS');
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

// Run tests if this file is executed directly
runAllAPITests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('API test suite crashed:', error);
        process.exit(1);
    });
