import anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { sha256 } from "js-sha256";

// abbreviation for too long name
// note this returns the array
const findAddr = anchor.utils.publicKey.findProgramAddressSync;

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
async function airdrop(provider, target, lamps) {
    let sig = await provider.connection.requestAirdrop(target, lamps);
    await provider.connection.confirmTransaction(sig);
    return sig;
}

export { findAddr, findAssocAddr, discriminator, sleep, airdrop };
