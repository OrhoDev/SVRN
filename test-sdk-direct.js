// Direct SDK test - no frontend, just SDK + API
import { SolvrnClient } from './sdk/dist/index.js';
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';

const circuitJson = JSON.parse(fs.readFileSync('./frontend/circuit/target/circuit.json', 'utf-8'));

async function test() {
    console.log('=== DIRECT SDK TEST ===\n');
    
    // 1. Initialize SDK
    const svrn = new SolvrnClient('http://localhost:3000');
    await svrn.init(circuitJson);
    console.log('✅ SDK initialized\n');
    
    // 2. Test API endpoints
    const nextId = await svrn.api.getNextProposalId();
    console.log('✅ Next proposal ID:', nextId.nextId);
    
    // 3. Test encryption (requires provider but no signing)
    const connection = new Connection('https://api.devnet.solana.com');
    const testKeypair = Keypair.generate();
    const wallet = new Wallet(testKeypair);
    const provider = new AnchorProvider(connection, wallet, {});
    
    try {
        const encrypted = await svrn.encryption.encryptVote(provider, 1, 1000);
        console.log('✅ Encryption works (no signature needed)');
        console.log('   Ciphertext length:', encrypted.ciphertext.length);
        console.log('   Nonce length:', encrypted.nonce.length);
        console.log('   Public key length:', encrypted.public_key.length);
    } catch (e) {
        console.log('❌ Encryption failed:', e.message);
    }
    
    console.log('\n=== TEST COMPLETE ===');
    console.log('\nNote: Encryption uses ephemeral keys (no wallet signature needed)');
    console.log('Vote submission is done by relayer (relayer signs transaction)');
}

test().catch(console.error);
