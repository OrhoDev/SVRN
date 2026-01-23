use anchor_lang::prelude::*;

declare_id!("AZesBUcWibfPn1omUmKxWjqbikmYDUK16X78SX995zSS");

#[program]
pub mod solvote_chain {
    use super::*;

    // 1. Initialize Proposal (Now "Engine-Ready" with Merkle Root)
    // We now accept 'voting_mint' and 'merkle_root'.
    // voting_mint: Defines WHICH token is required to vote.
    // merkle_root: Root of the eligibility snapshot Merkle tree.
    pub fn initialize_proposal(
        ctx: Context<InitProposal>, 
        proposal_id: u64, 
        voting_mint: Pubkey,
        merkle_root: [u8; 32]
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        proposal.proposal_id = proposal_id;
        proposal.vote_count = 0;
        proposal.authority = ctx.accounts.authority.key();
        
        // Save the configuration
        proposal.voting_mint = voting_mint;
        proposal.merkle_root = merkle_root;
        
        msg!("SVRN Engine: Proposal #{} Initialized. Governance Token: {}, Merkle Root: {:?}", 
             proposal_id, voting_mint, merkle_root);
        Ok(())
    }

    // 2. Submit Anonymous Vote
    // (Logic remains the same, but now operates within the context of the mint defined above)
    pub fn submit_vote(
        ctx: Context<SubmitVote>,
        nullifier: [u8; 32],      
        ciphertext: Vec<u8>,
        pubkey: [u8; 32],
        nonce: u128
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let nullifier_account = &mut ctx.accounts.nullifier_account;

        // A. Anti-Double-Vote Check
        nullifier_account.nullifier = nullifier;
        nullifier_account.proposal = proposal.key();
        
        // B. Store Encrypted Data
        nullifier_account.ciphertext = ciphertext.clone();
        nullifier_account.pubkey = pubkey;
        nullifier_account.nonce = nonce;

        // C. Update State
        proposal.vote_count += 1;
        
        msg!("SVRN Relay: Vote Recorded. Ciphertext Size: {}", ciphertext.len());
        Ok(())
    }
}

// --- CONTEXTS ---

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct InitProposal<'info> {
    #[account(
        init,
        payer = authority,
        // SPACE CALCULATION:
        // 8 (Discriminator) + 8 (ID) + 8 (Count) + 32 (Auth) + 32 (Mint) + 32 (Merkle Root)
        space = 8 + 8 + 8 + 32 + 32 + 32,
        seeds = [b"proposal", proposal_id.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32], ciphertext: Vec<u8>, pubkey: [u8; 32], nonce: u128)]
pub struct SubmitVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = relayer,
        space = 8 + 32 + 32 + 4 + 200 + 32 + 16, 
        seeds = [b"nullifier", proposal.key().as_ref(), nullifier.as_ref()],
        bump
    )]
    pub nullifier_account: Account<'info, NullifierAccount>,

    #[account(mut)]
    pub relayer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// --- STATE ---

#[account]
pub struct Proposal {
    pub proposal_id: u64,
    pub vote_count: u64,
    pub authority: Pubkey,
    // ⚠️ The Engine Feature:
    // Defines the token address required for ZK verification
    pub voting_mint: Pubkey,
    // Merkle root of eligibility snapshot
    // Each leaf is: pedersen_hash(user_secret, balance)
    pub merkle_root: [u8; 32],
}

#[account]
pub struct NullifierAccount {
    pub proposal: Pubkey,
    pub nullifier: [u8; 32],
    pub ciphertext: Vec<u8>, 
    pub pubkey: [u8; 32], 
    pub nonce: u128,      
}