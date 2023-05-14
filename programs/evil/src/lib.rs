use adobe;
use adobe::cpi::accounts::{Borrow, Repay};
use anchor_lang::prelude::*;

declare_id!("5zAQ1XhjuHcQtUXJSTjbmyDagmKVHDMi5iADv5PfYEUK");

#[program]
pub mod evil {
    use super::*;

    pub fn borrow_proxy(ctx: Context<Adobe>, amount: u64) -> Result<()> {
        msg!("evil borrow_proxy");

        adobe::cpi::borrow(ctx.accounts.into_borrow_context(), amount)?;

        Ok(())
    }

    pub fn borrow_double(ctx: Context<Adobe>, amount: u64) -> Result<()> {
        msg!("evil borrow_double");

        adobe::cpi::borrow(ctx.accounts.into_borrow_context(), amount)?;
        adobe::cpi::borrow(ctx.accounts.into_borrow_context(), amount)?;

        Ok(())
    }

    pub fn repay_proxy(ctx: Context<Adobe>, amount: u64) -> Result<()> {
        msg!("evil repay_proxy");

        adobe::cpi::repay(ctx.accounts.into_repay_context(), amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Adobe<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: Test program, unecessary checks
    pub state: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: Test program, unecessary checks
    pub pool: AccountInfo<'info>,
    /// CHECK: Test program, unecessary checks
    pub pool_token: AccountInfo<'info>,
    /// CHECK: Test program, unecessary checks
    pub user_token: AccountInfo<'info>,
    /// CHECK: Test program, unecessary checks
    pub instructions: AccountInfo<'info>,
    /// CHECK: Test program, unecessary checks
    pub token_program: AccountInfo<'info>,
    /// CHECK: Test program, unecessary checks
    pub adobe_program: AccountInfo<'info>,
}

impl<'info> Adobe<'info> {
    fn into_borrow_context(&self) -> CpiContext<'_, '_, '_, 'info, Borrow<'info>> {
        CpiContext::new(
            self.adobe_program.clone(),
            Borrow {
                state: self.state.clone(),
                pool: self.pool.clone(),
                pool_token: self.pool_token.clone(),
                user_token: self.user_token.clone(),
                instructions: self.instructions.clone(),
                token_program: self.token_program.clone(),
            },
        )
    }

    fn into_repay_context(&self) -> CpiContext<'_, '_, '_, 'info, Repay<'info>> {
        CpiContext::new(
            self.adobe_program.clone(),
            Repay {
                user: self.user.to_account_info(),
                state: self.state.clone(),
                pool: self.pool.clone(),
                pool_token: self.pool_token.clone(),
                user_token: self.user_token.clone(),
                instructions: self.instructions.clone(),
                token_program: self.token_program.clone(),
            },
        )
    }
}
