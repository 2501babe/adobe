use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

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
    // register authority
    pub fn new(ctx: Context<New>, state_bump: u8) -> ProgramResult {
        msg!("adobe new");

        ctx.accounts.state.bump = state_bump;
        ctx.accounts.state.authority_key = ctx.accounts.authority.key();

        Ok(())
    }

    // ADD POOL
    // for a given token mint, sets up a token pool and a voucher mint
    pub fn add_pool(ctx: Context<AddPool>) -> ProgramResult {
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
    // this account will be the only permitted to add pools
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
pub struct AddPool {}

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
    authority_key: Pubkey,
}
