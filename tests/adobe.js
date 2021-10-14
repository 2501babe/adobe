import anchor from "@project-serum/anchor";
import spl from "@solana/spl-token";
import { findAddr, findAssocAddr, discriminator, airdrop } from "../app/util.js";
import * as api from "../app/api.js";

const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const SYSVAR_INSTRUCTIONS_PUBKEY = anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY;
const TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;

const TXN_OPTS = {commitment: "processed", preflightCommitment: "processed", skipPreflight: false};
const TOKEN_DECIMALS = 6;

anchor.setProvider(anchor.Provider.local(null, TXN_OPTS));
const provider = anchor.getProvider();
api.setProvider(provider);

const adobe = anchor.workspace.Adobe;
const wallet = anchor.getProvider().wallet;

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

        let txn = new anchor.web3.Transaction;
        txn.add(borrowIxn);
        txn.add(repayIxn);

        await provider.send(txn);
    });

});
