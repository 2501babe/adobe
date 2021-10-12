import anchor from "@project-serum/anchor";
import spl from "@solana/spl-token";
import { findAddr, findAssocAddr, discriminator } from "../app/util.js";

const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const SYSVAR_INSTRUCTIONS_PUBKEY = anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY;
const TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;
const TXN_OPTS = {commitment: "processed", preflightCommitment: "processed", skipPreflight: false};

// XXX if this is an actual library the provider should come from outside
// or just the connection? or the whole workspace object? idk
// one thing is with a website we need to give the wallet object to the provider...
anchor.setProvider(anchor.Provider.local(null, TXN_OPTS));
const adobe = anchor.workspace.Adobe;

let [stateKey, stateBump] = findAddr([discriminator("State")], adobe.programId);

function getMintKeys(mint) {
    let [poolKey, poolBump] = findAddr([discriminator("Pool"), mint.publicKey.toBuffer()], adobe.programId);
    let [poolTokenKey] = findAddr([Buffer.from("TOKEN"), mint.publicKey.toBuffer()], adobe.programId);
    let [voucherMintKey] = findAddr([Buffer.from("VOUCHER"), mint.publicKey.toBuffer()], adobe.programId);

    return [poolKey, poolTokenKey, voucherMintKey, poolBump];
}

function initialize(authority) {
    return adobe.rpc.initialize(stateBump, {
        accounts: {
            authority: authority.publicKey,
            state: stateKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [authority.payer],
    });
}

function addPool(authority, mint) {
    let [poolKey, poolTokenKey, voucherMintKey, poolBump] = getMintKeys(mint);

    return adobe.rpc.addPool(poolBump, {
        accounts: {
            authority: authority.publicKey,
            state: stateKey,
            tokenMint: mint.publicKey,
            pool: poolKey,
            poolToken: poolTokenKey,
            voucherMint: voucherMintKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [authority.payer],
    });
}

export { initialize, addPool };
