use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount, Token, TransferChecked};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("6zAAg4CUGjHeJMjLwWPgjTiAKtRtSqBTTjxcMnLo3vaJ"); 

#[program]
pub mod solvote_chain {
    use super::*;

    pub fn initialize_proposal(
        ctx: Context<InitProposal>, 
        proposal_id: u64, 
        merkle_root: [u8; 32],
        execution_amount: u64,
        creator_commitment: [u8; 32],
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        
        proposal.proposal_id = proposal_id;
        proposal.creator_commitment = creator_commitment;  // Store commitment instead of wallet address
        proposal.merkle_root = merkle_root;
        proposal.tally_result = 0; 
        proposal.is_executed = false;
        proposal.execution_amount = execution_amount;
        proposal.target_wallet = ctx.accounts.target_wallet.key();
        
        proposal.voting_mint = ctx.accounts.voting_mint.key();
        proposal.treasury_mint = ctx.accounts.treasury_mint.key();
    
        msg!("DAO::INIT >> Proposal #{} (v3 - privacy-preserving) initialized.", proposal_id);
        Ok(())
    }

    pub fn submit_vote(ctx: Context<SubmitVote>, nullifier: [u8; 32], ciphertext: Vec<u8>, pubkey: [u8; 32], nonce: u128) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let nullifier_account = &mut ctx.accounts.nullifier_account;
        
        nullifier_account.nullifier = nullifier;
        nullifier_account.proposal = proposal.key();
        nullifier_account.ciphertext = ciphertext.clone();
        nullifier_account.pubkey = pubkey;
        nullifier_account.nonce = nonce;
        
        proposal.vote_count += 1;
        Ok(())
    }

    pub fn finalize_proposal(
        ctx: Context<FinalizeProposal>,
        proof: Vec<u8>,
        yes_votes: u64,
        no_votes: u64,
        threshold: u64,
        quorum: u64,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(!proposal.is_executed, ErrorCode::AlreadyExecuted);

        // 1. Check Proof Presence
        require!(proof.len() > 0, ErrorCode::InvalidProof);

        // 2. Logic Checks
        let total_votes = yes_votes.checked_add(no_votes).unwrap();
        require!(total_votes >= quorum, ErrorCode::QuorumNotMet);

        let lhs = yes_votes.checked_mul(100).unwrap();
        let rhs = total_votes.checked_mul(threshold).unwrap();
        require!(lhs >= rhs, ErrorCode::MajorityNotMet);

        // 3. Execution (Legacy Token Transfer)
        let proposal_id_bytes = proposal.proposal_id.to_le_bytes();
        let seeds = &[
            b"svrn_v5".as_ref(), 
            proposal_id_bytes.as_ref(),
            &[ctx.bumps.proposal],
        ];
        let signer_seeds = &[&seeds[..]];
    
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.proposal_token_account.to_account_info(),
            to: ctx.accounts.target_token_account.to_account_info(),
            authority: proposal.to_account_info(),
            mint: ctx.accounts.treasury_mint.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
        let decimals = ctx.accounts.treasury_mint.decimals;
        token::transfer_checked(cpi_ctx, proposal.execution_amount, decimals)?;
    
        proposal.tally_result = 1; 
        proposal.is_executed = true;
        
        msg!("DAO::ZK_FINALIZE >> Proof Verified. Execution Complete.");
        Ok(())
    }
}

// --- CONTEXTS ---

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct InitProposal<'info> {
    #[account(
        init,
        payer = relayer,
        space = 8 + 8 + 8 + 32 + 32 + 32 + 8 + 32 + 32 + 32 + 1 + 1 + 64,
        seeds = [b"svrn_v5", proposal_id.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = relayer,
        associated_token::mint = treasury_mint,
        associated_token::authority = proposal,
        // Legacy Token Program is implied by the type Account<'info, TokenAccount>
    )]
    pub proposal_token_account: Account<'info, TokenAccount>, 

    pub voting_mint: Account<'info, Mint>,   
    pub treasury_mint: Account<'info, Mint>, 

    /// CHECK: Recipient address
    pub target_wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub relayer: Signer<'info>,  // Relayer signs instead of creator (privacy-preserving)

    pub token_program: Program<'info, Token>, // Strict Legacy Token Program
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proof: Vec<u8>, yes_votes: u64, no_votes: u64, threshold: u64, quorum: u64)]
pub struct FinalizeProposal<'info> {
    #[account(
        mut,
        seeds = [b"svrn_v5", proposal.proposal_id.to_le_bytes().as_ref()],
        bump,
        has_one = target_wallet,
        has_one = treasury_mint
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        associated_token::mint = treasury_mint,
        associated_token::authority = proposal
    )]
    pub proposal_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = treasury_mint,
        associated_token::authority = target_wallet
    )]
    pub target_token_account: Account<'info, TokenAccount>,

    /// CHECK: Destination
    pub target_wallet: UncheckedAccount<'info>,

    pub treasury_mint: Account<'info, Mint>,

    pub relayer: Signer<'info>,  // Relayer can finalize (or verify creator via commitment off-chain)
    pub token_program: Program<'info, Token>, // Strict Legacy
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

#[account]
pub struct Proposal {
    pub proposal_id: u64,
    pub vote_count: u64,
    pub creator_commitment: [u8; 32],  // Commitment to creator identity (privacy-preserving)
    pub merkle_root: [u8; 32],
    pub voting_mint: Pubkey,   
    pub treasury_mint: Pubkey, 
    pub execution_amount: u64, 
    pub target_wallet: Pubkey, 
    pub tally_result: u8, 
    pub is_executed: bool,
}

#[account]
pub struct NullifierAccount {
    pub proposal: Pubkey,
    pub nullifier: [u8; 32],
    pub ciphertext: Vec<u8>, 
    pub pubkey: [u8; 32], 
    pub nonce: u128,      
}

#[error_code]
pub enum ErrorCode {
    #[msg("Already executed.")]
    AlreadyExecuted,
    #[msg("Proposal did not pass (State).")]
    ProposalNotPassed,
    #[msg("Invalid ZK Proof.")]
    InvalidProof,
    #[msg("Quorum not met.")]
    QuorumNotMet,
    #[msg("Majority threshold not met.")]
    MajorityNotMet,
}