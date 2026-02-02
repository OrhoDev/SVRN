#!/usr/bin/env node

/**
 * Comprehensive SDK Test Suite
 * Tests all SDK functionality without changing logic
 */

import { SolvrnClient } from '../sdk/dist/index.js';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

// Test configuration
const RELAYER_URL = 'http://localhost:3000';
const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = 'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv';

// Test wallet (generated for testing)
const testKeypair = Keypair.generate();
const testWallet = new Wallet(testKeypair);

// Setup connection and provider
const connection = new Connection(RPC_URL);
const provider = new AnchorProvider(connection, testWallet, { commitment: 'confirmed' });

// Test data
const testMetadata = {
    title: 'Test Proposal',
    desc: 'This is a test proposal for SDK testing',
    duration: 24 // 24 hours
};

const testVotingMint = 'So11111111111111111111111111111111111111112'; // Wrapped SOL

// Test results tracking
const testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

function log(message) {
    console.log(`[TEST] ${new Date().toISOString()} - ${message}`);
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

async function testSDKInitialization() {
    log('Testing SDK Initialization...');
    
    try {
        // Test basic SDK creation
        const svrn = new SolvrnClient(RELAYER_URL, undefined, PROGRAM_ID);
        logSuccess('SDK client created successfully');
        
        // Test SDK initialization with circuit
        await svrn.init();
        logSuccess('SDK initialized with default circuit');
        
        // Test ready status
        const isReady = svrn.isReady();
        if (isReady) {
            logSuccess('SDK reports ready status');
        } else {
            logError('SDK reports not ready after initialization');
        }
        
        return svrn;
    } catch (error) {
        logError('SDK initialization failed', error);
        return null;
    }
}

async function testAPIEndpoints() {
    log('Testing API Endpoints...');
    
    const svrn = new SolvrnClient(RELAYER_URL);
    
    try {
        // Test getNextProposalId
        log('Testing getNextProposalId...');
        const idResult = await svrn.api.getNextProposalId();
        if (idResult.success && typeof idResult.nextId === 'number') {
            logSuccess(`getNextProposalId returned: ${idResult.nextId}`);
        } else {
            logError('getNextProposalId failed', idResult);
        }
        
        // Test getAllProposals
        log('Testing getAllProposals...');
        const allProposals = await svrn.api.getAllProposals();
        if (allProposals.success && Array.isArray(allProposals.proposals)) {
            logSuccess(`getAllProposals returned ${allProposals.proposals.length} proposals`);
        } else {
            logError('getAllProposals failed', allProposals);
        }
        
        // Test getActiveProposals
        log('Testing getActiveProposals...');
        const activeProposals = await svrn.api.getActiveProposals();
        if (activeProposals.success && Array.isArray(activeProposals.proposals)) {
            logSuccess(`getActiveProposals returned ${activeProposals.proposals.length} active proposals`);
        } else {
            logError('getActiveProposals failed', activeProposals);
        }
        
        // Test getProposalsByMint
        log('Testing getProposalsByMint...');
        const mintProposals = await svrn.api.getProposalsByMint(testVotingMint);
        if (mintProposals.success && Array.isArray(mintProposals.proposals)) {
            logSuccess(`getProposalsByMint returned ${mintProposals.proposals.length} proposals`);
        } else {
            logError('getProposalsByMint failed', mintProposals);
        }
        
        // Test getEligibleProposals
        log('Testing getEligibleProposals...');
        const walletPubkey = testKeypair.publicKey.toBase58();
        const eligibleProposals = await svrn.api.getEligibleProposals(walletPubkey);
        if (eligibleProposals.success && Array.isArray(eligibleProposals.proposals)) {
            logSuccess(`getEligibleProposals returned ${eligibleProposals.proposals.length} eligible proposals`);
        } else {
            logError('getEligibleProposals failed', eligibleProposals);
        }
        
        return true;
    } catch (error) {
        logError('API endpoint testing failed', error);
        return false;
    }
}

async function testProposalCreation() {
    log('Testing Proposal Creation...');
    
    const svrn = new SolvrnClient(RELAYER_URL, undefined, PROGRAM_ID);
    
    try {
        // Initialize SDK first
        await svrn.init();
        
        // Test proposal creation
        log('Creating test proposal...');
        const result = await svrn.createProposal(
            provider,
            testKeypair.publicKey,
            testVotingMint,
            testMetadata,
            0.1, // gas buffer (deprecated but required)
            undefined // no proposal ID override
        );
        
        if (result && result.proposalId && result.txid) {
            logSuccess(`Proposal created successfully: ID=${result.proposalId}, TX=${result.txid}`);
            return result.proposalId;
        } else {
            logError('Proposal creation failed', result);
            return null;
        }
    } catch (error) {
        logError('Proposal creation failed with exception', error);
        return null;
    }
}

async function testEligibilityCheck(proposalId) {
    log('Testing Eligibility Check...');
    
    const svrn = new SolvrnClient(RELAYER_URL);
    
    try {
        const walletPubkey = testKeypair.publicKey.toBase58();
        
        // Test eligibility check
        log('Checking wallet eligibility...');
        const eligibility = await svrn.api.checkEligibility(proposalId, walletPubkey);
        
        if (eligibility && typeof eligibility.eligible === 'boolean') {
            logSuccess(`Eligibility check completed: eligible=${eligibility.eligible}, weight=${eligibility.weight}, balance=${eligibility.balance}`);
            return eligibility;
        } else {
            logError('Eligibility check failed', eligibility);
            return null;
        }
    } catch (error) {
        logError('Eligibility check failed with exception', error);
        return null;
    }
}

async function testProofGeneration(proposalId) {
    log('Testing Proof Generation...');
    
    const svrn = new SolvrnClient(RELAYER_URL, undefined, PROGRAM_ID);
    
    try {
        await svrn.init();
        
        const walletPubkey = testKeypair.publicKey.toBase58();
        
        // Test getProof
        log('Getting Merkle proof...');
        const proofData = await svrn.api.getProof(proposalId, walletPubkey);
        
        if (proofData && proofData.success && proofData.proof) {
            logSuccess(`Proof generated successfully: root=${proofData.proof.root}, weight=${proofData.proof.weight}`);
            
            // Test ZK proof generation
            log('Generating ZK proof...');
            const zkProof = await svrn.prover.generateVoteProof(
                proofData.proof.secret,
                proofData,
                proposalId
            );
            
            if (zkProof && zkProof.proof && zkProof.publicInputs) {
                logSuccess(`ZK proof generated successfully: ${zkProof.publicInputs.length} public inputs`);
                return { proofData, zkProof };
            } else {
                logError('ZK proof generation failed', zkProof);
                return null;
            }
        } else {
            logError('Merkle proof generation failed', proofData);
            return null;
        }
    } catch (error) {
        logError('Proof generation failed with exception', error);
        return null;
    }
}

async function testVoteCasting(proposalId) {
    log('Testing Vote Casting...');
    
    const svrn = new SolvrnClient(RELAYER_URL, undefined, PROGRAM_ID);
    
    try {
        await svrn.init();
        
        const walletPubkey = testKeypair.publicKey.toBase58();
        const choice = 1; // YES vote
        
        // Test vote casting
        log('Casting test vote...');
        const voteResult = await svrn.castVote(provider, walletPubkey, proposalId, choice);
        
        if (voteResult && voteResult.success) {
            logSuccess(`Vote cast successfully: TX=${voteResult.tx}`);
            return voteResult;
        } else {
            logError('Vote casting failed', voteResult);
            return null;
        }
    } catch (error) {
        logError('Vote casting failed with exception', error);
        return null;
    }
}

async function testEncryption() {
    log('Testing Vote Encryption...');
    
    const svrn = new SolvrnClient(RELAYER_URL);
    
    try {
        const choice = 1; // YES
        const weight = 1000;
        
        // Test vote encryption
        log('Encrypting vote...');
        const encrypted = await svrn.encryption.encryptVote(provider, choice, weight);
        
        if (encrypted && encrypted.ciphertext && encrypted.public_key && encrypted.nonce) {
            logSuccess(`Vote encrypted successfully: ciphertext length=${encrypted.ciphertext.length}`);
            return encrypted;
        } else {
            logError('Vote encryption failed', encrypted);
            return null;
        }
    } catch (error) {
        logError('Vote encryption failed with exception', error);
        return null;
    }
}

async function testErrorHandling() {
    log('Testing Error Handling...');
    
    const svrn = new SolvrnClient(RELAYER_URL);
    
    try {
        // Test invalid proposal ID
        log('Testing invalid proposal ID...');
        try {
            await svrn.api.getProposal(-1);
            logError('Should have failed with invalid proposal ID');
        } catch (error) {
            logSuccess('Correctly handled invalid proposal ID');
        }
        
        // Test invalid wallet address
        log('Testing invalid wallet address...');
        try {
            await svrn.api.checkEligibility(1, 'invalid-address');
            logError('Should have failed with invalid wallet address');
        } catch (error) {
            logSuccess('Correctly handled invalid wallet address');
        }
        
        // Test invalid vote choice
        log('Testing invalid vote choice...');
        await svrn.init();
        try {
            await svrn.castVote(provider, testKeypair.publicKey.toBase58(), 1, 5); // Invalid choice
            logError('Should have failed with invalid vote choice');
        } catch (error) {
            logSuccess('Correctly handled invalid vote choice');
        }
        
        return true;
    } catch (error) {
        logError('Error handling test failed', error);
        return false;
    }
}

async function runAllTests() {
    log('Starting Comprehensive SDK Test Suite...');
    log(`Relayer URL: ${RELAYER_URL}`);
    log(`Test Wallet: ${testKeypair.publicKey.toBase58()}`);
    
    // Test 1: SDK Initialization
    const svrn = await testSDKInitialization();
    if (!svrn) {
        log('CRITICAL: SDK initialization failed, aborting remaining tests');
        return printResults();
    }
    
    // Test 2: API Endpoints
    await testAPIEndpoints();
    
    // Test 3: Proposal Creation
    const proposalId = await testProposalCreation();
    
    if (proposalId) {
        // Test 4: Eligibility Check
        await testEligibilityCheck(proposalId);
        
        // Test 5: Proof Generation
        await testProofGeneration(proposalId);
        
        // Test 6: Vote Casting (may fail if not eligible)
        await testVoteCasting(proposalId);
    } else {
        log('Skipping tests that require a valid proposal ID');
    }
    
    // Test 7: Encryption
    await testEncryption();
    
    // Test 8: Error Handling
    await testErrorHandling();
    
    return printResults();
}

function printResults() {
    log('\n' + '='.repeat(60));
    log('TEST SUITE RESULTS');
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
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test suite crashed:', error);
            process.exit(1);
        });
}

export { runAllTests, testSDKInitialization, testAPIEndpoints, testProposalCreation };
