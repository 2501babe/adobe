use core::convert::TryInto;
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use anchor_spl::token::{self, Mint, TokenAccount, MintTo, Burn, Transfer, Token};
use anchor_lang::solana_program as solana;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const TOKEN_NAMESPACE: &[u8]   = b"TOKEN";
const VOUCHER_NAMESPACE: &[u8] = b"VOUCHER";
const RESTORE_OPCODE: u64      = 0x4d257a808b23063a;

// XXX oki shower first but what am i doing here
// simple function list
// * new: i dont know if i actually need this?
// * add_pool: given a mint, sets up a token account
// * deposit
// * withdraw
// * borrow
// * restore
// and the only tricky thing here is borrow must use transaction introspection
// to step forward from itself and confirm the next adobe ixn is a restore for the same amount

#[program]
#[deny(unused_must_use)]
pub mod adobe {
    use super::*;

    // NEW
    // register authority for adding new loan pools
    pub fn new(ctx: Context<New>, state_bump: u8) -> ProgramResult {
        msg!("adobe new");

        ctx.accounts.state.bump = state_bump;
        ctx.accounts.state.authority = ctx.accounts.authority.key();

        Ok(())
    }

    // ADD POOL
    // for a given token mint, sets up a pool struct, token account, and voucher mint
    pub fn add_pool(ctx: Context<AddPool>) -> ProgramResult {
        msg!("adobe add_pool");

        ctx.accounts.pool.token_mint = ctx.accounts.token_mint.key();
        ctx.accounts.pool.pool_token = ctx.accounts.pool_token.key();
        ctx.accounts.pool.voucher_mint = ctx.accounts.voucher_mint.key();

        Ok(())
    }

    // DEPOSIT
    // receives tokens and mints vouchers
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> ProgramResult {
        msg!("adobe deposit");

        let state_seed: &[&[&[u8]]] = &[&[
            &State::discriminator()[..],
            &[ctx.accounts.state.bump],
        ]];

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
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> ProgramResult {
        msg!("adobe withdraw");

        let state_seed: &[&[&[u8]]] = &[&[
            &State::discriminator()[..],
            &[ctx.accounts.state.bump],
        ]];

        let burn_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.voucher_mint.to_account_info(),
                to: ctx.accounts.user_voucher.to_account_info(),
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
    // confirms there exists a matching restore, then lends tokens
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> ProgramResult {
        msg!("adobe borrow");

        let ixn_data = ctx.accounts.instructions.try_borrow_data()?;

        // loop through instructions, looking for an equivalent restore to this borrow
        let mut i = solana::sysvar::instructions::load_current_index(&ixn_data) as usize + 1;
        loop {
            // get the next instruction, die if theres no more
            if let Ok(ixn) = solana::sysvar::instructions::load_instruction_at(i, &ixn_data) {
                // check if its a call to this program, otherwise continue
                if ixn.program_id == *ctx.program_id {
                    // the only allowed call to this program is an equivalent restore
                    // this is the "yes i know the difference between regular and context-free grammers" case
                    if u64::from_be_bytes(ixn.data[..8].try_into().unwrap()) == RESTORE_OPCODE
                    && u64::from_le_bytes(ixn.data[8..16].try_into().unwrap()) == amount {
                        break;
                    } else {
                        return Err(AdobeError::ExtraCall.into());
                    }
                } else {
                    i += 1;
                }
            }
            else {
                return Err(AdobeError::NoRestore.into());
            }
        }

        let state_seed: &[&[&[u8]]] = &[&[
            &State::discriminator()[..],
            &[ctx.accounts.state.bump],
        ]];

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

    // RESTORE
    // receives tokens
    pub fn restore(ctx: Context<Restore>, amount: u64) -> ProgramResult {
        let state_seed: &[&[&[u8]]] = &[&[
            &State::discriminator()[..],
            &[ctx.accounts.state.bump],
        ]];

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

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(state_bump: u8)]
pub struct New<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [&State::discriminator()[..]],
        bump = state_bump,
        payer = authority,
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
        seeds = [&State::discriminator()[..]],
        bump = state.bump,
        has_one = authority,
    )]
    pub state: Account<'info, State>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        seeds = [&Pool::discriminator()[..], token_mint.key().as_ref()],
        bump,
        payer = authority,
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
    #[account(seeds = [&State::discriminator()[..]], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(seeds = [&Pool::discriminator()[..], pool.token_mint.as_ref()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.pool_token)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut, address = pool.voucher_mint)]
    pub voucher_mint: Account<'info, Mint>,
    #[account(mut, constraint =  user_token.mint == pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_voucher.mint == pool.voucher_mint)]
    pub user_voucher: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(seeds = [&State::discriminator()[..]], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(seeds = [&Pool::discriminator()[..], pool.token_mint.as_ref()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.pool_token)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut, address = pool.voucher_mint)]
    pub voucher_mint: Account<'info, Mint>,
    #[account(mut, constraint =  user_token.mint == pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_voucher.mint == pool.voucher_mint)]
    pub user_voucher: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(seeds = [&State::discriminator()[..]], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(seeds = [&Pool::discriminator()[..], pool.token_mint.as_ref()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.pool_token)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut, constraint =  user_token.mint == pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Restore<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [&State::discriminator()[..]], bump = state.bump)]
    pub state: Account<'info, State>,
    #[account(seeds = [&Pool::discriminator()[..], pool.token_mint.as_ref()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.pool_token)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut, constraint =  user_token.mint == pool.token_mint)]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(Default)]
pub struct State {
    bump: u8,
    authority: Pubkey,
}

#[account]
#[derive(Default)]
pub struct Pool {
    token_mint: Pubkey,
    pool_token: Pubkey,
    voucher_mint: Pubkey,
}

#[error]
pub enum AdobeError {
    #[msg("borrow requires an equivalent restore")]
    NoRestore,
    #[msg("non-restore adobe calls after borrow are disallowed")]
    ExtraCall,
}
