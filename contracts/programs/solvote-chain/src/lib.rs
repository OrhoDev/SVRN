use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU");

#[program]
pub mod solvote_chain {
    use super::*;

    pub fn initialize_proposal(
        ctx: Context<InitProposal>, 
        proposal_id: u64, 
        merkle_root: [u8; 32],
        execution_amount: u64,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        
        // 1. Config
        proposal.proposal_id = proposal_id;
        proposal.vote_count = 0;
        proposal.authority = ctx.accounts.authority.key();
        proposal.merkle_root = merkle_root;
        proposal.is_executed = false;

        // 2. Execution Config
        proposal.execution_amount = execution_amount;
        proposal.target_wallet = ctx.accounts.target_wallet.key();
        
        // 3. Token Config
        proposal.voting_mint = ctx.accounts.voting_mint.key();
        proposal.treasury_mint = ctx.accounts.treasury_mint.key();

        msg!("DAO::INIT >> Proposal #{} (v2) initialized.", proposal_id);
        msg!("DAO::CONFIG >> Voting: {}, Payout: {}", proposal.voting_mint, proposal.treasury_mint);
             
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

    pub fn finalize_execution(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(!proposal.is_executed, ErrorCode::AlreadyExecuted);

        // 1. Setup Seeds for PDA Signing (using v2 seed)
        let proposal_id_bytes = proposal.proposal_id.to_le_bytes();
        let seeds = &[
            b"proposal_v2", 
            proposal_id_bytes.as_ref(),
            &[ctx.bumps.proposal],
        ];
        let signer_seeds = &[&seeds[..]];

        // 2. Define Transfer Accounts
        let cpi_accounts = Transfer {
            from: ctx.accounts.proposal_token_account.to_account_info(),
            to: ctx.accounts.target_token_account.to_account_info(),     
            authority: proposal.to_account_info(),                       
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        // 3. Execute Transfer
        let amount = proposal.execution_amount;
        token::transfer(cpi_ctx, amount)?;

        // 4. Mark Complete
        proposal.is_executed = true;
        msg!("DAO::EXECUTE >> Sent {} tokens", amount);
        
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
        // Increased space for safety + new fields
        space = 8 + 8 + 8 + 32 + 32 + 32 + 8 + 32 + 32 + 32 + 1 + 64,
        // ⚠️ FIXED: Versioned Seed
        seeds = [b"proposal_v2", proposal_id.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    // Automatic Vault Creation
    #[account(
        init,
        payer = authority,
        associated_token::mint = treasury_mint,
        associated_token::authority = proposal
    )]
    pub proposal_token_account: Account<'info, TokenAccount>,

    pub voting_mint: Account<'info, Mint>,   
    pub treasury_mint: Account<'info, Mint>, 
    
    /// CHECK: Target wallet logic
    pub target_wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(
        mut,
        // ⚠️ FIXED: Versioned Seed
        seeds = [b"proposal_v2", proposal.proposal_id.to_le_bytes().as_ref()],
        bump,
        has_one = authority
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        associated_token::mint = proposal.treasury_mint,
        associated_token::authority = proposal
    )]
    pub proposal_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = proposal.treasury_mint,
        associated_token::authority = proposal.target_wallet
    )]
    pub target_token_account: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
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
    pub merkle_root: [u8; 32],
    
    pub voting_mint: Pubkey,   
    pub treasury_mint: Pubkey, 
    
    pub execution_amount: u64, 
    pub target_wallet: Pubkey, 
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
}