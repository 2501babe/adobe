const anchor = require("@project-serum/anchor");
const spl = require("@solana/spl-token");
const sha256 = require("js-sha256").sha256;
const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
const ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;

const TXN_OPTS = {commitment: "processed", preflightCommitment: "processed", skipPreflight: false};

anchor.setProvider(anchor.Provider.env());

const adobe = anchor.workspace.Adobe;
const wallet = anchor.getProvider().wallet;

// abbreviation for too long name
// note this returns the array
const findAddr = anchor.utils.publicKey.findProgramAddressSync;

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

describe("adobe flash loan program", () => {

    it("adobe new", async () => {
        let [stateKey, stateBump] = findAddr([discriminator("State")], adobe.programId);

        await adobe.rpc.new(stateBump, {
            accounts: {
                authority: wallet.publicKey,
                state: stateKey,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    });

});
