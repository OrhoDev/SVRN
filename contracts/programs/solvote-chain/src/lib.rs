use anchor_lang::prelude::*;
// ✅ Import from token_interface to support both SPL and Token-2022
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
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
        
        proposal.proposal_id = proposal_id;
        proposal.authority = ctx.accounts.authority.key();
        proposal.merkle_root = merkle_root;
        proposal.tally_result = 0; 
        proposal.is_executed = false;
        proposal.execution_amount = execution_amount;
        proposal.target_wallet = ctx.accounts.target_wallet.key();
        
        proposal.voting_mint = ctx.accounts.voting_mint.key();
        proposal.treasury_mint = ctx.accounts.treasury_mint.key();
    
        msg!("DAO::INIT >> Proposal #{} (v2) initialized.", proposal_id);
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

    pub fn set_tally(ctx: Context<SetTally>, result: u8) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(!proposal.is_executed, ErrorCode::AlreadyExecuted);
        proposal.tally_result = result;
        msg!("DAO::TALLY >> Result set to {}", result);
        Ok(())
    }

    pub fn finalize_execution(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(!proposal.is_executed, ErrorCode::AlreadyExecuted);
        require!(proposal.tally_result == 1, ErrorCode::ProposalNotPassed);
    
        let proposal_id_bytes = proposal.proposal_id.to_le_bytes();
        let seeds = &[
            b"proposal_v2", 
            proposal_id_bytes.as_ref(),
            &[ctx.bumps.proposal],
        ];
        let signer_seeds = &[&seeds[..]];
    
        // ✅ Uses TokenInterface types safely
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.proposal_token_account.to_account_info(),
            to: ctx.accounts.target_token_account.to_account_info(),
            authority: proposal.to_account_info(),
            mint: ctx.accounts.treasury_mint.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
        let decimals = ctx.accounts.treasury_mint.decimals;
        token_interface::transfer_checked(cpi_ctx, proposal.execution_amount, decimals)?;
    
        proposal.is_executed = true;
        msg!("DAO::EXECUTE >> Transfer Complete");
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
        space = 8 + 8 + 8 + 32 + 32 + 32 + 8 + 32 + 32 + 32 + 1 + 1 + 64,
        seeds = [b"proposal_v2", proposal_id.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = treasury_mint,
        associated_token::authority = proposal
    )]
    pub proposal_token_account: InterfaceAccount<'info, TokenAccount>, 

    pub voting_mint: InterfaceAccount<'info, Mint>,   
    pub treasury_mint: InterfaceAccount<'info, Mint>, 

    /// CHECK: Recipient address for the execution funds.
    pub target_wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>, 
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal_v2", proposal.proposal_id.to_le_bytes().as_ref()],
        bump,
        has_one = authority
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        associated_token::mint = treasury_mint,
        associated_token::authority = proposal
    )]
    pub proposal_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = treasury_mint,
        associated_token::authority = target_wallet
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Destination wallet verified by the Proposal account state.
    pub target_wallet: UncheckedAccount<'info>,

    pub treasury_mint: InterfaceAccount<'info, Mint>,

    pub authority: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SetTally<'info> {
    #[account(mut, has_one = authority)]
    pub proposal: Account<'info, Proposal>,
    pub authority: Signer<'info>,
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
    #[msg("Proposal did not pass.")]
    ProposalNotPassed,
}