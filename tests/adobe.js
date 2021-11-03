import assert from "assert";
import anchor from "@project-serum/anchor";
import spl from "@solana/spl-token";
import { findAddr, findAssocAddr, discriminator, airdrop } from "../app/util.js";
import * as api from "../app/api.js";

const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const SYSVAR_INSTRUCTIONS_PUBKEY = anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY;
const TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;

const TXN_OPTS = {commitment: "processed", preflightCommitment: "processed", skipPreflight: true};
const TOKEN_DECIMALS = 6;

anchor.setProvider(anchor.Provider.local(null, TXN_OPTS));
const provider = anchor.getProvider();
api.setProvider(provider);

const adobe = anchor.workspace.Adobe;
const evil = anchor.workspace.Evil;
const wallet = anchor.getProvider().wallet;

console.log(
`adobe: ${adobe.programId.toString()}
evil: ${evil.programId.toString()}
`);

// we create a fresh token, for which we need...
// * arbitrary authority
// * derived pool address
// * derived voucher address
// * user associated account
const tokenMintAuthority = new anchor.web3.Keypair;
let tokenMint;
let poolKey;
let poolBump;
let poolTokenKey;
let voucherMintKey;
let userTokenKey;
let userVoucherKey;

let [stateKey, stateBump] = findAddr([discriminator("State")], adobe.programId);

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
    await airdrop(provider, tokenMintAuthority.publicKey, 100 * LAMPORTS_PER_SOL);

    // and mint 100 of the token to the wallet
    await tokenMint.mintTo(
        userTokenKey,
        tokenMintAuthority,
        [],
        100 * 10 ** TOKEN_DECIMALS,
    );
}

// what it says
async function poolBalance(mint) {
    let [poolTokenKey] = findAddr([Buffer.from("TOKEN"), mint.publicKey.toBuffer()], adobe.programId);
    let res = await provider.connection.getTokenAccountBalance(poolTokenKey);

    // this is a string but im just using it for asserts so who cares
    return res.value.amount;
}

describe("adobe flash loan program", () => {
    let amount = 10 ** TOKEN_DECIMALS;

    it("setup", async () => {
        await setup();
    });

    it("adobe initalize", async () => {
        await api.initialize(wallet);
    });

    it("adobe add_pool", async () => {
        await api.addPool(wallet, tokenMint);
    });

    it("adobe deposit", async () => {
        await api.deposit(wallet, tokenMint, amount * 2);
    });

    it("adobe withdraw", async () => {
        await api.withdraw(wallet, tokenMint, amount);
    });

    it("adobe borrow/repay", async () => {
        let [borrowIxn, repayIxn] = api.borrow(wallet, tokenMint, amount);

        // normal borrow
        let txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);
        txn.add(repayIxn);

        let balBefore = await poolBalance(tokenMint);
        await provider.send(txn);
        let balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        // dont repay
        txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(async () => provider.send(txn), "borrow without repay fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        // dont fully repay
        [borrowIxn] = api.borrow(wallet, tokenMint, amount + 1);
        txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);
        txn.add(repayIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(provider.send(txn), "borrow more than repay fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        // borrow too much
        [borrowIxn, repayIxn] = api.borrow(wallet, tokenMint, amount * 10);
        txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);
        txn.add(repayIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(provider.send(txn), "borrow more than available fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        // double borrow (raw instruction)
        txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);
        txn.add(borrowIxn);
        txn.add(repayIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(provider.send(txn), "multiple borrow fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        // dounle borrow (direct cpi)
        [borrowIxn, repayIxn] = api.borrow(wallet, tokenMint, amount / 10);
        let evilIxn = evil.instruction.borrowProxy(new anchor.BN(amount / 10), {
            accounts: {
                state: stateKey,
                pool: poolKey,
                poolToken: poolTokenKey,
                userToken: userTokenKey,
                instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                adobeProgram: adobe.programId,
            },
        });

        txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);
        txn.add(evilIxn);
        txn.add(repayIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(provider.send(txn), "borrow and cpi fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        txn = new anchor.web3.Transaction;
        txn.add(evilIxn);
        txn.add(borrowIxn);
        txn.add(repayIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(provider.send(txn), "cpi and borrow fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        txn = new anchor.web3.Transaction;
        txn.add(evilIxn);
        txn.add(evilIxn);
        txn.add(repayIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(provider.send(txn), "cpi and cpi fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        // dounle borrow (batched cpi)
        evilIxn = evil.instruction.borrowDouble(new anchor.BN(amount / 10), {
            accounts: {
                state: stateKey,
                pool: poolKey,
                poolToken: poolTokenKey,
                userToken: userTokenKey,
                instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                adobeProgram: adobe.programId,
            },
        });

        txn = new anchor.web3.Transaction;
        txn.add(evilIxn);
        txn.add(repayIxn);

        balBefore = await poolBalance(tokenMint);
        await assert.rejects(provider.send(txn), "cpi double borrow fails");
        balAfter = await poolBalance(tokenMint);
        assert.equal(balAfter, balBefore, "program token balance unchanged");

        // XXX next attack is: borrow, proxy repay 1, proxy borrow, repay
        // solution is to ban cpi repay. then i can reenable borrow cpi ban for extra safety
        // and finally have the borrow loop detect second borrows for good measure
        // XXX i should compartmentalize by pool so people can borrow different collateral
        // move mutex to pool, add the case in the check loop
    });

});
