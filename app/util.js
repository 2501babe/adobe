import anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

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

export { findAddr, findAssocAddr, sleep, airdrop };
