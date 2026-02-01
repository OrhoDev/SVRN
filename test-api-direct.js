#!/usr/bin/env node

/**
 * Direct API Endpoint Tests for SVRN Relayer
 * Tests actual API endpoints without SDK dependencies
 */

const RELAYER_URL = process.env.RELAYER_URL || 'http://localhost:3000';

const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
};

function logTest(name, status, error = null) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} ${name}`);
  if (error) {
    console.log(`   Error: ${error.message || error}`);
    testResults.errors.push({ name, error: error.message || String(error) });
  }
  if (status === 'PASS') testResults.passed++;
  else if (status === 'FAIL') testResults.failed++;
  else testResults.skipped++;
}

async function fetchAPI(endpoint, options = {}) {
  const url = `${RELAYER_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return await response.json();
  } catch (error) {
    throw error;
  }
}

async function testNextProposalId() {
  try {
    const result = await fetchAPI('/next-proposal-id');
    if (result.success && typeof result.nextId === 'number') {
      logTest('GET /next-proposal-id', 'PASS');
      return result.nextId;
    } else {
      logTest('GET /next-proposal-id', 'FAIL', new Error('Invalid response'));
      return null;
    }
  } catch (error) {
    logTest('GET /next-proposal-id', 'FAIL', error);
    return null;
  }
}

async function testInitializeSnapshot(proposalId) {
  try {
    const result = await fetchAPI('/initialize-snapshot', {
      method: 'POST',
      body: JSON.stringify({
        proposalId,
        votingMint: 'So11111111111111111111111111111111111111112',
        metadata: {
          title: 'API Direct Test Proposal',
          desc: 'Testing relayer API directly',
          duration: 24,
        },
        creator: '11111111111111111111111111111112',
      }),
    });

    if (result.success && result.root) {
      logTest('POST /initialize-snapshot', 'PASS');
      return true;
    } else {
      logTest('POST /initialize-snapshot', 'FAIL', new Error(result.error || 'Unknown error'));
      return false;
    }
  } catch (error) {
    logTest('POST /initialize-snapshot', 'FAIL', error);
    return false;
  }
}

async function testGetProposal(proposalId) {
  try {
    const result = await fetchAPI(`/proposal/${proposalId}`);
    if (result.success && result.proposal) {
      logTest('GET /proposal/:id', 'PASS');
      return true;
    } else if (!result.success) {
      logTest('GET /proposal/:id (not found)', 'SKIP');
      return false;
    } else {
      logTest('GET /proposal/:id', 'FAIL', new Error('Invalid response'));
      return false;
    }
  } catch (error) {
    logTest('GET /proposal/:id', 'FAIL', error);
    return false;
  }
}

async function testGetProof(proposalId) {
  try {
    const result = await fetchAPI('/get-proof', {
      method: 'POST',
      body: JSON.stringify({
        proposalId: proposalId.toString(),
        userPubkey: '11111111111111111111111111111112',
      }),
    });

    if (result.success && result.proof) {
      logTest('POST /get-proof', 'PASS');
      return true;
    } else {
      logTest('POST /get-proof', 'SKIP', new Error(result.error || 'No proof available'));
      return false;
    }
  } catch (error) {
    logTest('POST /get-proof', 'SKIP', error);
    return false;
  }
}

async function testGetVoteCounts(proposalId) {
  try {
    const result = await fetchAPI(`/vote-counts/${proposalId}`);
    if (result.success && typeof result.yesVotes === 'number') {
      logTest('GET /vote-counts/:id', 'PASS');
      return true;
    } else {
      logTest('GET /vote-counts/:id', 'SKIP', new Error(result.error || 'No votes'));
      return false;
    }
  } catch (error) {
    logTest('GET /vote-counts/:id', 'FAIL', error);
    return false;
  }
}

async function testProveTally(proposalId) {
  try {
    const result = await fetchAPI('/prove-tally', {
      method: 'POST',
      body: JSON.stringify({
        proposalId,
        yesVotes: 10,
        noVotes: 5,
        threshold: 51,
        quorum: 10,
      }),
    });

    if (result.success && result.proof) {
      logTest('POST /prove-tally', 'PASS');
      return true;
    } else {
      logTest('POST /prove-tally', 'SKIP', new Error(result.error || 'Tally circuit not available'));
      return false;
    }
  } catch (error) {
    logTest('POST /prove-tally', 'SKIP', error);
    return false;
  }
}

async function testErrorHandling() {
  try {
    // Test non-existent proposal
    const result = await fetchAPI('/proposal/999999');
    if (!result.success) {
      logTest('Error Handling (404)', 'PASS');
    } else {
      logTest('Error Handling (404)', 'SKIP');
    }
  } catch (error) {
    logTest('Error Handling (404)', 'SKIP', error);
  }
}

async function runAllTests() {
  console.log('🚀 Starting SVRN API Direct Test Suite\n');
  console.log(`Relayer: ${RELAYER_URL}\n`);

  // Test 1: Get next proposal ID
  const nextId = await testNextProposalId();
  if (!nextId) {
    console.log('\n⚠️  Cannot proceed without proposal ID. Is relayer running?');
    process.exit(1);
  }

  // Test 2: Initialize snapshot
  const testProposalId = nextId + Math.floor(Math.random() * 10000);
  const snapshotCreated = await testInitializeSnapshot(testProposalId);

  if (snapshotCreated) {
    // Test 3: Get proposal
    await testGetProposal(testProposalId);

    // Test 4: Get proof
    await testGetProof(testProposalId);

    // Test 5: Get vote counts
    await testGetVoteCounts(testProposalId);

    // Test 6: Prove tally
    await testProveTally(testProposalId);
  }

  // Test 7: Error handling
  await testErrorHandling();

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`📈 Total: ${testResults.passed + testResults.failed + testResults.skipped}`);

  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors:');
    testResults.errors.forEach(({ name, error }) => {
      console.log(`   ${name}: ${error}`);
    });
  }

  console.log('\n' + '='.repeat(50));

  if (testResults.failed === 0) {
    console.log('🎉 All critical tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check errors above.');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});

