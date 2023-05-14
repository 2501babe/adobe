use anchor_lang::prelude::*;
use anchor_lang::solana_program as solana;
use anchor_lang::Discriminator;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use core::convert::TryInto;

declare_id!("Adobe11111111111111111111111111111111111112");

const STATE_NAMESPACE: &[u8] = b"STATE";
const POOL_NAMESPACE: &[u8] = b"POOL";
const TOKEN_NAMESPACE: &[u8] = b"TOKEN";
const VOUCHER_NAMESPACE: &[u8] = b"VOUCHER";

#[program]
pub mod adobe {
    use super::*;

    // NEW
    // register authority for adding new loan pools
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.state.set_inner(State {
            bump: *ctx.bumps.get("state").unwrap(),
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    // ADD POOL
    // for a given token mint, sets up a pool struct, token account, and voucher mint
    pub fn add_pool(ctx: Context<AddPool>) -> Result<()> {
        ctx.accounts.pool.set_inner(Pool {
            bump: *ctx.bumps.get("pool").unwrap(),
            borrowing: false,
            token_mint: ctx.accounts.token_mint.key(),
            pool_token: ctx.accounts.pool_token.key(),
            voucher_mint: ctx.accounts.voucher_mint.key(),
        });

        Ok(())
    }

    // DEPOSIT
    // receives tokens and mints vouchers
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let state_seed: &[&[&[u8]]] = &[&[STATE_NAMESPACE, &[ctx.accounts.state.bump]]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.pool_token.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            state_seed,
        );

        token::transfer(transfer_ctx, amount)?;

        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.voucher_mint.to_account_info(),
                to: ctx.accounts.user_voucher.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            state_seed,
        );

        token::mint_to(mint_ctx, amount)?;

        Ok(())
    }

    // WITHDRAW
    // burns vouchers and disburses tokens
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let state_seed: &[&[&[u8]]] = &[&[STATE_NAMESPACE, &[ctx.accounts.state.bump]]];

        let burn_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.voucher_mint.to_account_info(),
                from: ctx.accounts.user_voucher.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            state_seed,
        );

        token::burn(burn_ctx, amount)?;

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_token.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            state_seed,
        );

        token::transfer(transfer_ctx, amount)?;

        Ok(())
    }

    // BORROW
    // confirms there exists a matching repay, then lends tokens
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.pool.borrowing, AdobeError::Borrowing);

        let ixns = ctx.accounts.instructions.to_account_info();

        // make sure this isnt a cpi call
        let current_index =
            solana::sysvar::instructions::load_current_index_checked(&ixns)? as usize;
        let current_ixn =
            solana::sysvar::instructions::load_instruction_at_checked(current_index, &ixns)?;
        require_keys_eq!(
            current_ixn.program_id,
            *ctx.program_id,
            AdobeError::CpiBorrow
        );

        // loop through instructions, looking for an equivalent repay to this borrow
        let mut i = current_index + 1;
        loop {
            // get the next instruction, die if theres no more
            if let Ok(ixn) = solana::sysvar::instructions::load_instruction_at_checked(i, &ixns) {
                // check if we have a toplevel repay toward the same pool
                // if so, confirm the amount, otherwise next instruction
                if ixn.program_id == *ctx.program_id
                    && ixn.data.get(..8) == Some(&instruction::Repay::DISCRIMINATOR)
                    && ixn.accounts.get(2).map(|account| account.pubkey)
                        == Some(ctx.accounts.pool.key())
                {
                    if u64::from_le_bytes(ixn.data[8..16].try_into().unwrap()) == amount {
                        break;
                    } else {
                        return Err(AdobeError::IncorrectRepay.into());
                    }
                } else {
                    i += 1;
                }
            } else {
                return Err(AdobeError::NoRepay.into());
            }
        }

        let state_seed: &[&[&[u8]]] = &[&[STATE_NAMESPACE, &[ctx.accounts.state.bump]]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_token.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            state_seed,
        );

        token::transfer(transfer_ctx, amount)?;
        ctx.accounts.pool.borrowing = true;

        Ok(())
    }

    // REPAY
    // receives tokens
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        let ixns = ctx.accounts.instructions.to_account_info();

        // make sure this isnt a cpi call
        let current_index =
            solana::sysvar::instructions::load_current_index_checked(&ixns)? as usize;
        let current_ixn =
            solana::sysvar::instructions::load_instruction_at_checked(current_index, &ixns)?;
        require_keys_eq!(
            current_ixn.program_id,
            *ctx.program_id,
            AdobeError::CpiRepay
        );

        let state_seed: &[&[&[u8]]] = &[&[STATE_NAMESPACE, &[ctx.accounts.state.bump]]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.pool_token.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
            state_seed,
        );

        token::transfer(transfer_ctx, amount)?;
        ctx.accounts.pool.borrowing = false;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [STATE_NAMESPACE],
        bump,
        payer = authority,
        space = 8 + State::INIT_SPACE,
    )]
    pub state: Account<'info, State>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [STATE_NAMESPACE],
        bump = state.bump,
        has_one = authority,
    )]
    pub state: Account<'info, State>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        seeds = [POOL_NAMESPACE, token_mint.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        seeds = [TOKEN_NAMESPACE, token_mint.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = state,
        payer = authority,
    )]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(
        init,
        seeds = [VOUCHER_NAMESPACE, token_mint.key().as_ref()],
        bump,
        mint::authority = state,
        mint::decimals = token_mint.decimals,
        payer = authority,
    )]
    pub voucher_mint: Account<'info, Mint>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(seeds = [STATE_NAMESPACE], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(seeds = [POOL_NAMESPACE, pool.token_mint.as_ref()], bump = pool.bump, has_one = pool_token, has_one = voucher_mint)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub voucher_mint: Account<'info, Mint>,
    #[account(mut, token::mint = pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.voucher_mint)]
    pub user_voucher: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(seeds = [STATE_NAMESPACE], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(seeds = [POOL_NAMESPACE, pool.token_mint.as_ref()], bump = pool.bump, has_one = pool_token, has_one = voucher_mint)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub voucher_mint: Account<'info, Mint>,
    #[account(mut, token::mint = pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.voucher_mint)]
    pub user_voucher: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(seeds = [STATE_NAMESPACE], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(mut, seeds = [POOL_NAMESPACE, pool.token_mint.as_ref()], bump = pool.bump, has_one = pool_token)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(address = solana::sysvar::instructions::ID)]
    /// CHECK: Address constrained to sysvar
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [STATE_NAMESPACE], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(mut, seeds = [POOL_NAMESPACE, pool.token_mint.as_ref()], bump = pool.bump, has_one = pool_token)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(address = solana::sysvar::instructions::ID)]
    /// CHECK: Address constrained to sysvar
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct State {
    bump: u8,
    authority: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    bump: u8,
    borrowing: bool,
    token_mint: Pubkey,
    pool_token: Pubkey,
    voucher_mint: Pubkey,
}

#[error_code]
pub enum AdobeError {
    #[msg("borrow requires an equivalent repay")]
    NoRepay,
    #[msg("repay exists but in the wrong amount")]
    IncorrectRepay,
    #[msg("cannot call borrow via cpi")]
    CpiBorrow,
    #[msg("cannot call repay via cpi")]
    CpiRepay,
    #[msg("a borrow is already in progress")]
    Borrowing,
}
