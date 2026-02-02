// Standalone SDK Demo - No frontend needed!
// Shows what the SDK can actually do
// Run: node demo-standalone.js

import { SolvrnClient } from './dist/index.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';

const RELAYER_URL = process.env.RELAYER_URL || 'http://localhost:3000';
const ARCIUM_PROGRAM_ID = 'DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS';
const SOLVRN_PROGRAM_ID = '6zAAg4CUGjHeJMjLwWPgjTiAKtRtSqBTTjxcMnLo3vaJ';

async function demo() {
    console.log('=== SOLVRN SDK STANDALONE DEMO ===\n');
    
    // 1. Initialize SDK
    console.log('1. Initializing SDK...');
    const svrn = new SolvrnClient(RELAYER_URL, ARCIUM_PROGRAM_ID, SOLVRN_PROGRAM_ID);
    
    // Load circuit JSON (required for ZK proofs)
    const circuitPath = '../frontend/circuit/target/circuit.json';
    if (!fs.existsSync(circuitPath)) {
        console.log(`⚠️  Circuit JSON not found at ${circuitPath}`);
        console.log('   Skipping ZK initialization (you can still test API endpoints)\n');
    } else {
        const circuitJson = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
        await svrn.init(circuitJson);
        console.log('✅ SDK initialized with ZK backend\n');
    }
    
    // 2. Test API endpoints (no wallet needed)
    console.log('2. Testing API endpoints...');
    try {
        const nextId = await svrn.api.getNextProposalId();
        console.log(`✅ Next Proposal ID: ${nextId.nextId}\n`);
    } catch (e) {
        console.log(`❌ API error: ${e.message}\n`);
        return;
    }
    
    // 3. Test encryption (needs provider but no signing)
    console.log('3. Testing vote encryption...');
    const connection = new Connection('https://api.devnet.solana.com');
    const testKeypair = Keypair.generate();
    const wallet = new Wallet(testKeypair);
    const provider = new AnchorProvider(connection, wallet, {});
    
    try {
        const encrypted = await svrn.encryption.encryptVote(provider, 1, 1000);
        console.log('✅ Encryption works!');
        console.log(`   Ciphertext: ${encrypted.ciphertext.length} bytes`);
        console.log(`   Nonce: ${encrypted.nonce.length} bytes`);
        console.log(`   Public Key: ${encrypted.public_key.length} bytes\n`);
    } catch (e) {
        console.log(`⚠️  Encryption failed: ${e.message}`);
        console.log('   (This is OK if Arcium MXE keygen is not complete)\n');
    }
    
    // 4. Show SDK capabilities
    console.log('=== SDK CAPABILITIES ===\n');
    console.log('✅ Proposal Creation:');
    console.log('   svrn.createProposal(provider, authority, votingMint, metadata, gasBuffer)');
    console.log('   → Creates proposal via relayer (privacy-preserving)');
    console.log('   → Returns: { proposalId, txid }\n');
    
    console.log('✅ Voting:');
    console.log('   svrn.castVote(provider, walletPubkey, proposalId, choice)');
    console.log('   → Generates ZK proof (client-side)');
    console.log('   → Encrypts vote (client-side)');
    console.log('   → Submits via relayer (gasless)');
    console.log('   → Returns: { success, tx, error }\n');
    
    console.log('✅ API Methods:');
    console.log('   svrn.api.getNextProposalId()');
    console.log('   svrn.api.getProposal(proposalId)');
    console.log('   svrn.api.getProof(proposalId, userPubkey)');
    console.log('   svrn.api.getVoteCounts(proposalId)');
    console.log('   svrn.api.proveTally(proposalId, yesVotes, noVotes, threshold, quorum)\n');
    
    console.log('✅ Sub-modules:');
    console.log('   svrn.prover.generateVoteProof(secret, proofData, proposalId)');
    console.log('   svrn.encryption.encryptVote(provider, choice, weight)\n');
    
    console.log('=== WHAT THE SDK DOES ===\n');
    console.log('1. ZK Proof Generation:');
    console.log('   - Uses Barretenberg WASM (UltraHonk)');
    console.log('   - Compiles Noir circuits');
    console.log('   - Generates proofs client-side\n');
    
    console.log('2. Vote Encryption:');
    console.log('   - Uses Arcium MPC (threshold cryptography)');
    console.log('   - Ephemeral keys (no wallet signature needed)');
    console.log('   - Client-side encryption\n');
    
    console.log('3. Privacy-Preserving Proposals:');
    console.log('   - Creator identity hidden on-chain');
    console.log('   - Relayer signs transactions');
    console.log('   - Gasless for users\n');
    
    console.log('4. Gasless Voting:');
    console.log('   - Relayer pays for transactions');
    console.log('   - Users only encrypt and submit');
    console.log('   - No wallet signatures needed\n');
    
    console.log('=== USAGE IN YOUR PROJECT ===\n');
    console.log('```typescript');
    console.log('import { SolvrnClient } from "solvrn-sdk";');
    console.log('');
    console.log('const svrn = new SolvrnClient(relayerUrl, arciumId, programId);');
    console.log('await svrn.init(circuitJson);');
    console.log('');
    console.log('// Create proposal');
    console.log('const { proposalId } = await svrn.createProposal(...);');
    console.log('');
    console.log('// Cast vote');
    console.log('const result = await svrn.castVote(provider, wallet, proposalId, 1);');
    console.log('```\n');
    
    console.log('=== THAT\'S IT! ===');
    console.log('The SDK handles:');
    console.log('  ✅ ZK proof generation');
    console.log('  ✅ Vote encryption');
    console.log('  ✅ Merkle proof fetching');
    console.log('  ✅ Transaction relaying');
    console.log('  ✅ Privacy preservation');
    console.log('  ✅ Gasless operations');
}

demo().catch(console.error);

