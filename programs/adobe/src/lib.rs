use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use anchor_spl::token::{self, Token, Burn, Mint, MintTo, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const POOL_NAMESPACE: &[u8]    = b"POOL";
const VOUCHER_NAMESPACE: &[u8] = b"VOUCHER";

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
    // for a given token mint, sets up a token pool account and a voucher mint
    pub fn add_pool(ctx: Context<AddPool>) -> ProgramResult {
        msg!("adobe add_pool");

        Ok(())
    }

    // DEPOSIT
    // receives tokens and mints vouchers
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> ProgramResult {
        Ok(())
    }

    // WITHDRAW
    // burns vouchers and disburses tokens
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> ProgramResult {
        Ok(())
    }

    // BORROW
    // confirms there exists a matching restore, then lends tokens
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> ProgramResult {
        Ok(())
    }

    // RESTORE
    // receives tokens
    pub fn restore(ctx: Context<Restore>, amount: u64) -> ProgramResult {
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
        seeds = [POOL_NAMESPACE, token_mint.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = state,
        payer = authority,
    )]
    pub token_pool: Account<'info, TokenAccount>,
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
pub struct Deposit {}

#[derive(Accounts)]
pub struct Withdraw {}

#[derive(Accounts)]
pub struct Borrow {}

#[derive(Accounts)]
pub struct Restore {}

#[account]
#[derive(Default)]
pub struct State {
    bump: u8,
    authority: Pubkey,
}
