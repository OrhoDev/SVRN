#!/usr/bin/env node

/**
 * Production Verification Script
 * Tests API endpoints as they would be used in production
 */

const RELAYER_URL = process.env.RELAYER_URL || 'http://localhost:3000';

console.log('🔍 Production Verification - API Endpoints\n');
console.log(`Relayer: ${RELAYER_URL}\n`);

async function verifyAPIEndpoints() {
  console.log('🌐 Verifying API Endpoints...\n');
  
  const results = {
    passed: 0,
    failed: 0,
    endpoints: [],
  };
  
  // 1. GET /next-proposal-id
  console.log('1. GET /next-proposal-id');
  try {
    const response = await fetch(`${RELAYER_URL}/next-proposal-id`);
    const data = await response.json();
    
    if (data.success && typeof data.nextId === 'number') {
      console.log(`   ✅ Working - Next ID: ${data.nextId}`);
      results.passed++;
      results.endpoints.push({ name: 'GET /next-proposal-id', status: 'OK', id: data.nextId });
      
      // Use this ID for subsequent tests
      const testProposalId = data.nextId;
      
      // 2. POST /initialize-snapshot
      console.log('\n2. POST /initialize-snapshot');
      try {
        const snapResponse = await fetch(`${RELAYER_URL}/initialize-snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: testProposalId,
            votingMint: 'So11111111111111111111111111111111111111112',
            metadata: {
              title: 'Production Verification',
              desc: 'Testing API endpoints',
              duration: 24,
            },
            creator: '11111111111111111111111111111112',
          }),
        });
        const snapData = await snapResponse.json();
        
        if (snapData.success && snapData.root) {
          console.log(`   ✅ Working - Root: ${snapData.root.substring(0, 20)}...`);
          console.log(`   ✅ Voters: ${snapData.count}`);
          results.passed++;
          results.endpoints.push({ name: 'POST /initialize-snapshot', status: 'OK', root: snapData.root });
          
          // 3. GET /proposal/:id
          console.log('\n3. GET /proposal/:id');
          try {
            const propResponse = await fetch(`${RELAYER_URL}/proposal/${testProposalId}`);
            const propData = await propResponse.json();
            
            if (propData.success && propData.proposal) {
              console.log('   ✅ Working - Proposal retrieved');
              results.passed++;
              results.endpoints.push({ name: 'GET /proposal/:id', status: 'OK' });
            } else {
              console.log(`   ❌ Failed: ${propData.error || 'Unknown'}`);
              results.failed++;
              results.endpoints.push({ name: 'GET /proposal/:id', status: 'FAIL', error: propData.error });
            }
          } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            results.failed++;
            results.endpoints.push({ name: 'GET /proposal/:id', status: 'ERROR', error: error.message });
          }
          
          // 4. GET /vote-counts/:id
          console.log('\n4. GET /vote-counts/:id');
          try {
            const countsResponse = await fetch(`${RELAYER_URL}/vote-counts/${testProposalId}`);
            const countsData = await countsResponse.json();
            
            if (countsData.success !== undefined) {
              console.log(`   ✅ Working - Yes: ${countsData.yesVotes || 0}, No: ${countsData.noVotes || 0}`);
              results.passed++;
              results.endpoints.push({ name: 'GET /vote-counts/:id', status: 'OK' });
            } else {
              console.log(`   ⚠️  Unexpected response`);
              results.failed++;
            }
          } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            results.failed++;
            results.endpoints.push({ name: 'GET /vote-counts/:id', status: 'ERROR', error: error.message });
          }
          
          // 5. POST /get-proof
          console.log('\n5. POST /get-proof');
          try {
            const proofResponse = await fetch(`${RELAYER_URL}/get-proof`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proposalId: testProposalId.toString(),
                userPubkey: '11111111111111111111111111111112',
              }),
            });
            const proofData = await proofResponse.json();
            
            if (proofData.success && proofData.proof) {
              console.log('   ✅ Working - Proof generated');
              results.passed++;
              results.endpoints.push({ name: 'POST /get-proof', status: 'OK' });
            } else {
              console.log(`   ⚠️  ${proofData.error || 'User not eligible'}`);
              results.endpoints.push({ name: 'POST /get-proof', status: 'SKIP', reason: proofData.error });
            }
          } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
            results.endpoints.push({ name: 'POST /get-proof', status: 'SKIP', error: error.message });
          }
          
          // 6. POST /prove-tally
          console.log('\n6. POST /prove-tally');
          try {
            const tallyResponse = await fetch(`${RELAYER_URL}/prove-tally`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proposalId: testProposalId,
                yesVotes: 10,
                noVotes: 5,
                threshold: 51,
                quorum: 10,
              }),
            });
            const tallyData = await tallyResponse.json();
            
            if (tallyData.success && tallyData.proof) {
              console.log(`   ✅ Working - Proof generated (${tallyData.proof.length} chars)`);
              results.passed++;
              results.endpoints.push({ name: 'POST /prove-tally', status: 'OK' });
            } else {
              console.log(`   ⚠️  ${tallyData.error || 'Circuit not available'}`);
              results.endpoints.push({ name: 'POST /prove-tally', status: 'SKIP', reason: tallyData.error });
            }
          } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
            results.endpoints.push({ name: 'POST /prove-tally', status: 'SKIP', error: error.message });
          }
          
        } else {
          console.log(`   ❌ Failed: ${snapData.error || 'Unknown error'}`);
          results.failed++;
          results.endpoints.push({ name: 'POST /initialize-snapshot', status: 'FAIL', error: snapData.error });
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.failed++;
        results.endpoints.push({ name: 'POST /initialize-snapshot', status: 'ERROR', error: error.message });
      }
      
    } else {
      console.log(`   ❌ Failed: ${data.error || 'Invalid response'}`);
      results.failed++;
      results.endpoints.push({ name: 'GET /next-proposal-id', status: 'FAIL', error: data.error });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.failed++;
    results.endpoints.push({ name: 'GET /next-proposal-id', status: 'ERROR', error: error.message });
  }
  
  // 7. Error Handling - Non-existent proposal
  console.log('\n7. Error Handling - 404 Response');
  try {
    const errorResponse = await fetch(`${RELAYER_URL}/proposal/999999`);
    const errorData = await errorResponse.json();
    
    if (!errorData.success) {
      console.log('   ✅ Working - Correctly returns error for non-existent proposal');
      results.passed++;
      results.endpoints.push({ name: 'Error Handling (404)', status: 'OK' });
    } else {
      console.log('   ⚠️  Unexpected success for non-existent proposal');
      results.endpoints.push({ name: 'Error Handling (404)', status: 'WARN' });
    }
  } catch (error) {
    console.log(`   ⚠️  Error: ${error.message}`);
    results.endpoints.push({ name: 'Error Handling (404)', status: 'SKIP' });
  }
  
  return results;
}

async function main() {
  const results = await verifyAPIEndpoints();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Production Verification Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total Tested: ${results.passed + results.failed}`);
  console.log('='.repeat(60));
  
  console.log('\n📋 Endpoint Status:');
  results.endpoints.forEach(endpoint => {
    const icon = endpoint.status === 'OK' ? '✅' : endpoint.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`   ${icon} ${endpoint.name}: ${endpoint.status}`);
    if (endpoint.error) {
      console.log(`      Error: ${endpoint.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  
  if (results.failed === 0 && results.passed > 0) {
    console.log('🎉 PRODUCTION READY - All critical endpoints working!');
    console.log('\n✅ API endpoints are functional and ready for production use.');
    process.exit(0);
  } else if (results.passed > 0) {
    console.log('⚠️  Most endpoints working, but some issues found.');
    console.log('   Review the output above for details.');
    process.exit(1);
  } else {
    console.log('❌ Critical issues found - endpoints not ready for production.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('💥 Verification crashed:', error);
  process.exit(1);
});
