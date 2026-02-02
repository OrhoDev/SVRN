// Find recent transactions from the relayer
import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('6zAAg4CUGjHeJMjLwWPgjTiAKtRtSqBTTjxcMnLo3vaJ');
const RELAYER_WALLET = new PublicKey('9rFkFKpUHuAAhDKB5k47RUvB3UfJw9vRMqY82LwKnQFP');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function findTransactions() {
    console.log('=== FINDING RECENT TRANSACTIONS ===\n');
    
    // Get recent signatures from relayer wallet
    console.log('Searching for transactions from relayer wallet...');
    const signatures = await connection.getSignaturesForAddress(RELAYER_WALLET, { limit: 10 });
    
    console.log(`Found ${signatures.length} recent transactions:\n`);
    
    let proposalTx = null;
    let voteTx = null;
    
    for (const sig of signatures) {
        const tx = await connection.getTransaction(sig.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!tx) continue;
        
        // Check if it's a program interaction
        const isProgramTx = tx.transaction.message.accountKeys.some(key => 
            key.equals(PROGRAM_ID)
        );
        
        if (isProgramTx) {
            // Check instruction data to determine if it's proposal or vote
            const instructions = tx.transaction.message.instructions;
            for (const ix of instructions) {
                if (ix.programId.equals(PROGRAM_ID)) {
                    // Try to decode (simplified check)
                    const data = ix.data;
                    if (data && data.length > 0) {
                        // Proposal creation uses initialize_proposal
                        // Vote uses submit_vote
                        if (!proposalTx) {
                            proposalTx = sig.signature;
                            console.log('✅ PROPOSAL CREATION FOUND:');
                            console.log(`   ${sig.signature}`);
                            console.log(`   Explorer: https://explorer.solana.com/tx/${sig.signature}?cluster=devnet`);
                            console.log(`   Time: ${new Date(sig.blockTime * 1000).toLocaleString()}\n`);
                        } else if (!voteTx) {
                            voteTx = sig.signature;
                            console.log('✅ VOTE SUBMISSION FOUND:');
                            console.log(`   ${sig.signature}`);
                            console.log(`   Explorer: https://explorer.solana.com/tx/${sig.signature}?cluster=devnet`);
                            console.log(`   Time: ${new Date(sig.blockTime * 1000).toLocaleString()}\n`);
                        }
                    }
                }
            }
        }
        
        if (proposalTx && voteTx) break;
    }
    
    if (!proposalTx) {
        console.log('⚠️  No proposal creation found in recent transactions');
        console.log('   Try creating a proposal first!\n');
    }
    
    if (!voteTx) {
        console.log('⚠️  No vote submission found in recent transactions');
        console.log('   Try voting on a proposal first!\n');
    }
    
    // Also check program account for proposals
    console.log('\n=== CHECKING PROGRAM ACCOUNTS ===');
    const programAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
            { dataSize: 200 } // Approximate size of Proposal account
        ]
    });
    console.log(`Found ${programAccounts.length} proposal accounts on-chain`);
    
    if (programAccounts.length > 0) {
        console.log('\n✅ PROPOSALS EXIST ON-CHAIN!');
        console.log('   Check program accounts in Solana Explorer:');
        console.log(`   https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet\n`);
    }
}

findTransactions().catch(console.error);
