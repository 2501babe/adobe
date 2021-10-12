import anchor from "@project-serum/anchor";
import spl from "@solana/spl-token";
import { findAddr, findAssocAddr, discriminator } from "../app/util.js";

const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const SYSVAR_INSTRUCTIONS_PUBKEY = anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY;
const TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;

const adobe = anchor.workspace.Adobe;

let [stateKey, stateBump] = findAddr([discriminator("State")], adobe.programId);

function getMintKeys(mint) {
    let [poolKey, poolBump] = findAddr([discriminator("Pool"), mint.publicKey.toBuffer()], adobe.programId);
    let [poolTokenKey] = findAddr([Buffer.from("TOKEN"), mint.publicKey.toBuffer()], adobe.programId);
    let [voucherMintKey] = findAddr([Buffer.from("VOUCHER"), mint.publicKey.toBuffer()], adobe.programId);

    return [poolKey, poolTokenKey, voucherMintKey, poolBump];
}

function setProvider(provider) {
    anchor.setProvider(provider);
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

async function deposit(user, mint, amount) {
    let [poolKey, poolTokenKey, voucherMintKey] = getMintKeys(mint);
    let [userTokenKey] = findAssocAddr(user.publicKey, mint.publicKey);
    let [userVoucherKey] = findAssocAddr(user.publicKey, voucherMintKey);

    let ixns = [];

    // create the voucher account for user if it doesnt exist
    if(!await anchor.getProvider().connection.getAccountInfo(userVoucherKey)) {
        ixns.push(spl.Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            voucherMintKey,
            userVoucherKey,
            user.publicKey,
            user.publicKey,
        ));
    }

    // approve a token transfer to avoid requiring the wallet
    ixns.push(spl.Token.createApproveInstruction(
        TOKEN_PROGRAM_ID,
        userTokenKey,
        stateKey,
        user.publicKey,
        [],
        amount,
    ));

    return adobe.rpc.deposit(new anchor.BN(amount), {
        accounts: {
            state: stateKey,
            pool: poolKey,
            poolToken: poolTokenKey,
            voucherMint: voucherMintKey,
            userToken: userTokenKey,
            userVoucher: userVoucherKey,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [user.payer],
        instructions: ixns,
    });
}

function withdraw(user, mint, amount) {
    let [poolKey, poolTokenKey, voucherMintKey] = getMintKeys(mint);
    let [userTokenKey] = findAssocAddr(user.publicKey, mint.publicKey);
    let [userVoucherKey] = findAssocAddr(user.publicKey, voucherMintKey);

    // again this is hardly much different
    return adobe.rpc.withdraw(new anchor.BN(amount), {
        accounts: {
            state: stateKey,
            pool: poolKey,
            poolToken: poolTokenKey,
            voucherMint: voucherMintKey,
            userToken: userTokenKey,
            userVoucher: userVoucherKey,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [user.payer],
        instructions: [
            spl.Token.createApproveInstruction(
                TOKEN_PROGRAM_ID,
                userVoucherKey,
                stateKey,
                user.publicKey,
                [],
                amount,
            ),
        ],
    });
}

export { setProvider, initialize, addPool, deposit, withdraw };
