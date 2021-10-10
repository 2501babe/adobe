const anchor = require("@project-serum/anchor");
const spl = require("@solana/spl-token");
const sha256 = require("js-sha256").sha256;
const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const SYSVAR_INSTRUCTIONS_PUBKEY = anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY;
const TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;

const TXN_OPTS = {commitment: "processed", preflightCommitment: "processed", skipPreflight: false};
const TOKEN_DECIMALS = 6;

anchor.setProvider(anchor.Provider.local(null, TXN_OPTS));
const provider = anchor.getProvider();

const adobe = anchor.workspace.Adobe;
const wallet = anchor.getProvider().wallet;

// abbreviation for too long name
// note this returns the array
const findAddr = anchor.utils.publicKey.findProgramAddressSync;

// we create a fresh token, for which we need...
// * arbitrary authority
// * derived pool address
// * derived voucher address
// * user associated account
const tokenMintAuthority = new anchor.web3.Keypair;
var tokenMint;
var poolTokenKey;
var voucherMintKey;
var userTokenKey;
var userVoucherKey;

let [stateKey, stateBump] = findAddr([discriminator("State")], adobe.programId);

// associated token addresses. also returns array
function findAssocAddr(walletKey, mintKey) {
    return findAddr([
        walletKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintKey.toBuffer(),
    ], ASSOCIATED_TOKEN_PROGRAM_ID);
}

// turns rust class name into discriminator
// i use these to namespace pdas
function discriminator(name) {
    let hash = sha256("account:" + name);
    return Buffer.from(hash.substring(0, 16), "hex");
}

// dont leave home without one
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// this is annoying because the native function doesnt mesh well with the anchor txopts or something idk
async function airdrop(target, lamps) {
    let sig = await provider.connection.requestAirdrop(target, lamps);
    await provider.connection.confirmTransaction(sig);
    return sig;
}

// all the throwaway bullshit in one convenient location
async function setup() {
    // first create a fresh mint
    tokenMint = await spl.Token.createMint(
        provider.connection,
        wallet.payer,
        tokenMintAuthority.publicKey,
        null,
        TOKEN_DECIMALS,
        TOKEN_PROGRAM_ID,
    );

    // find the pdas for adobes corresponding pool and voucher mint
    [poolKey, poolBump] = findAddr([discriminator("Pool"), tokenMint.publicKey.toBuffer()], adobe.programId);
    [poolTokenKey] = findAddr([Buffer.from("TOKEN"), tokenMint.publicKey.toBuffer()], adobe.programId);
    [voucherMintKey] = findAddr([Buffer.from("VOUCHER"), tokenMint.publicKey.toBuffer()], adobe.programId);

    // create our wallet an associated account for the token
    userTokenKey = (await tokenMint.getOrCreateAssociatedAccountInfo(wallet.publicKey)).address;

    // mint authority needs money
    await airdrop(tokenMintAuthority.publicKey, 100 * LAMPORTS_PER_SOL);

    // and mint 100 of the token to the wallet
    await tokenMint.mintTo(
        userTokenKey,
        tokenMintAuthority,
        [],
        100 * 10 ** TOKEN_DECIMALS,
    );
}

describe("adobe flash loan program", () => {
    let amount = 10 ** TOKEN_DECIMALS;

    it("setup", async () => {
        await setup();
    });

    it("adobe new", async () => {
        await adobe.rpc.new(stateBump, {
            accounts: {
                authority: wallet.publicKey,
                state: stateKey,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
            signers: [wallet.payer],
        });
    });

    it("adobe add_pool", async () => {
        await adobe.rpc.addPool(poolBump, {
            accounts: {
                authority: wallet.publicKey,
                state: stateKey,
                tokenMint: tokenMint.publicKey,
                pool: poolKey,
                poolToken: poolTokenKey,
                voucherMint: voucherMintKey,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [wallet.payer],
        });
    });

    it("adobe deposit", async () => {
        // deposit should implicitly create the user voucher account if needed
        [userVoucherKey] = findAssocAddr(wallet.publicKey, voucherMintKey);
        let createIxn = spl.Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            voucherMintKey,
            userVoucherKey,
            wallet.publicKey,
            wallet.publicKey,
        );

        // we are virtuous and do not require a wallet signature on our instruction
        let approveIxn = spl.Token.createApproveInstruction(
            TOKEN_PROGRAM_ID,
            userTokenKey,
            stateKey,
            wallet.publicKey,
            [],
            amount * 2,
        );

        await adobe.rpc.deposit(new anchor.BN(amount * 2), {
            accounts: {
                state: stateKey,
                pool: poolKey,
                poolToken: poolTokenKey,
                voucherMint: voucherMintKey,
                userToken: userTokenKey,
                userVoucher: userVoucherKey,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [wallet.payer],
            instructions: [createIxn, approveIxn],
        });
    });

    it("adobe withdraw", async () => {
        // again this is hardly much different
        let approveIxn = spl.Token.createApproveInstruction(
            TOKEN_PROGRAM_ID,
            userVoucherKey,
            stateKey,
            wallet.publicKey,
            [],
            amount,
        );

        await adobe.rpc.withdraw(new anchor.BN(amount), {
            accounts: {
                state: stateKey,
                pool: poolKey,
                poolToken: poolTokenKey,
                voucherMint: voucherMintKey,
                userToken: userTokenKey,
                userVoucher: userVoucherKey,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [wallet.payer],
            instructions: [approveIxn],
        });
    });

    it("adobe borrow/restore", async () => {
        let borrowIxn = adobe.instruction.borrow(new anchor.BN(amount), {
            accounts: {
                state: stateKey,
                pool: poolKey,
                poolToken: poolTokenKey,
                userToken: userTokenKey,
                instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
        }});

        let restoreIxn = adobe.instruction.restore(new anchor.BN(amount), {
            accounts: {
                user: wallet.publicKey,
                pool: poolKey,
                state: stateKey,
                poolToken: poolTokenKey,
                userToken: userTokenKey,
                tokenProgram: TOKEN_PROGRAM_ID,
        }});

        let txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);
        txn.add(restoreIxn);

        await provider.send(txn);
    });

});
