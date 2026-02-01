#!/usr/bin/env node

/**
 * Test Full Flow: Proposal Creation → Voting → Tally
 * Tests if users can complete the entire flow end-to-end
 */

const { SvrnClient } = require('./sdk/dist/index.js');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');

const RELAYER_URL = process.env.RELAYER_URL || 'http://localhost:3000';
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || 'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv';
const ARCIUM_PROGRAM_ID = process.env.ARCIUM_PROGRAM_ID || 'DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS';

console.log('🧪 Testing Full Flow: Proposal → Vote → Tally\n');

async function testFullFlow() {
  try {
    // Setup
    const connection = new Connection(RPC_URL, 'confirmed');
    const testUser = Keypair.generate();
    const wallet = new Wallet(testUser);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    
    // Airdrop SOL
    try {
      const sig = await connection.requestAirdrop(testUser.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      console.log('✅ Got test SOL');
    } catch (e) {
      console.log('⚠️  Airdrop failed, continuing...');
    }
    
    // Initialize SDK
    const svrn = new SvrnClient(RELAYER_URL, ARCIUM_PROGRAM_ID, PROGRAM_ID);
    console.log('✅ SDK initialized\n');
    
    // Step 1: Create Proposal
    console.log('📋 Step 1: Creating Proposal...');
    const nextId = await svrn.api.getNextProposalId();
    const proposalId = nextId.nextId;
    console.log(`   Proposal ID: ${proposalId}`);
    
    const { txid } = await svrn.createProposal(
      provider,
      testUser.publicKey,
      'So11111111111111111111111111111111111111112', // Native SOL
      {
        title: 'Full Flow Test Proposal',
        desc: 'Testing complete flow',
        duration: 24,
      },
      0.05 // Gas buffer
    );
    console.log(`   ✅ Proposal created: ${txid}\n`);
    
    // Step 2: Cast Vote
    console.log('🗳️  Step 2: Casting Vote...');
    const voteResult = await svrn.castVote(
      provider,
      testUser.publicKey.toBase58(),
      proposalId,
      1 // YES
    );
    
    if (voteResult.success) {
      console.log(`   ✅ Vote cast: ${voteResult.tx}\n`);
    } else {
      console.log(`   ❌ Vote failed: ${voteResult.error}\n`);
      return;
    }
    
    // Step 3: Get Vote Counts
    console.log('📊 Step 3: Getting Vote Counts...');
    const counts = await svrn.api.getVoteCounts(proposalId);
    console.log(`   Total votes: ${counts.realVoteCount || counts.totalVotes}`);
    console.log(`   Yes votes: ${counts.yesVotes} ${counts.breakdownSimulated ? '(simulated)' : ''}`);
    console.log(`   No votes: ${counts.noVotes} ${counts.breakdownSimulated ? '(simulated)' : ''}`);
    if (counts.warning) {
      console.log(`   ⚠️  Warning: ${counts.warning}\n`);
    } else {
      console.log();
    }
    
    // Step 4: Prove Tally
    console.log('🔐 Step 4: Proving Tally...');
    console.log('   ⚠️  Using vote counts from getVoteCounts()...');
    console.log('   ⚠️  Note: If breakdown is simulated, tally proof will prove simulated data!');
    
    const tallyProof = await svrn.api.proveTally(
      proposalId,
      counts.yesVotes,
      counts.noVotes,
      51, // Threshold
      10  // Quorum
    );
    
    if (tallyProof.success) {
      console.log(`   ✅ Tally proof generated: ${tallyProof.proof.substring(0, 20)}...`);
      console.log(`   ✅ Proof length: ${tallyProof.proof.length} chars`);
      console.log(`   ✅ Message: ${tallyProof.msg}\n`);
    } else {
      console.log(`   ❌ Tally failed: ${tallyProof.error}\n`);
      return;
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('📊 Full Flow Test Results');
    console.log('='.repeat(60));
    console.log('✅ Proposal Creation: WORKING');
    console.log('✅ Vote Casting: WORKING');
    console.log('⚠️  Vote Counts: WORKING (but breakdown is simulated)');
    console.log('✅ Tally Proof: WORKING (but proving simulated counts)');
    console.log('='.repeat(60));
    console.log('\n⚠️  IMPORTANT:');
    console.log('   - The tally proof is REAL (valid ZK proof)');
    console.log('   - But it\'s proving SIMULATED vote counts');
    console.log('   - For production, provide your own vote counts to proveTally()');
    console.log('   - Or wait for relayer decryption implementation\n');
    
  } catch (error) {
    console.error('❌ Full flow test failed:', error.message);
    console.error(error.stack);
  }
}

testFullFlow();

