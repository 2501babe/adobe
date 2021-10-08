const anchor = require("@project-serum/anchor");
const spl = require("@solana/spl-token");
const sha256 = require("js-sha256").sha256;
const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;

const TXN_OPTS = {commitment: "processed", preflightCommitment: "processed", skipPreflight: false};
const TOKEN_DECIMALS = 6;

anchor.setProvider(anchor.Provider.local(null, TXN_OPTS));
const conn = anchor.getProvider().connection;

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
var poolKey;
var voucherMintKey;
var walletTokenKey;

let [stateKey, stateBump] = findAddr([discriminator("State")], adobe.programId);

// associated token addresses. also returns array
function findAssocAddr(walletKey, mintKey) {
    return findAddr([
        walletKey.toBuffer(),
        tokenProgramKey.toBuffer(),
        mintKey.toBuffer(),
    ], assocTokenProgramKey);
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
    let sig = await conn.requestAirdrop(target, lamps);
    await conn.confirmTransaction(sig);
    return sig;
}

describe("adobe flash loan program", () => {

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
        tokenMint = await spl.Token.createMint(
            conn,
            wallet.payer,
            tokenMintAuthority.publicKey,
            null,
            TOKEN_DECIMALS,
            TOKEN_PROGRAM_ID,
        );

        [poolKey] = findAddr([Buffer.from("POOL"), tokenMint.publicKey.toBuffer()], adobe.programId);
        [voucherMintKey] = findAddr([Buffer.from("VOUCHER"), tokenMint.publicKey.toBuffer()], adobe.programId);

        await adobe.rpc.addPool({
            accounts: {
                authority: wallet.publicKey,
                state: stateKey,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenMint: tokenMint.publicKey,
                tokenPool: poolKey,
                voucherMint: voucherMintKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [wallet.payer],
        });
    });

    it("adobe deposit/withdraw", async () => {
        await airdrop(tokenMintAuthority.publicKey, 100 * LAMPORTS_PER_SOL);

        // create the associated accounts for tokens
        // XXX the voucher one should be part of the actual flow
        walletTokenKey = (await tokenMint.getOrCreateAssociatedAccountInfo(wallet.publicKey)).address;
        walletVoucherKey = (await tokenMint.getOrCreateAssociatedAccountInfo(wallet.publicKey)).address;

        await tokenMint.mintTo(
            walletTokenKey,
            tokenMintAuthority,
            [],
            100 * 10 ** TOKEN_DECIMALS,
        );
    });

/*
*/

});
