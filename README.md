## adobe flash loans

i ate a weed gummy last week and remembered instruction introspection was a thing and wanted to try and write a flash loan program using it instead of cpi calls

you use this by calling `borrow` in `app/api.js` and it returns two instructions, `borrow` and `repay`. you put them in any transaction you want, bracketing whatever action you want a loan for. the `borrow` instruction checks there exists a valid `repay` instruction before lending funds

annoyingly the `repay` instruction requires a wallet signature. i can prolly do away with this when the new transaction format lands, i didnt want to take up more bytes requiring a third instruction (spl `approve`)

i built it by writing it. you can look at the code it was not hard it took like a couple days. the challenges i ran into was sometimes i had other things to do. blah blah blah

i think a good ux for people not importing this as a lib would be if it was a feature in the wallet. you could have a button when you go to sign the transaction that would add in the flash loan instructions for whatever desired amount. this would be good ux for the guard instruction concept too, i think this kinda stuff will be a lot more interesting with the new transaction format

uhhh i didnt add any fees or ponzinomics bullshit so there is no reason why anyone would want to deposit funds into this if i deployed on mainnet. i think probably you need to offer normal overcollat loans to entice capital and then just offer flash loans as a feature on top. i dont really wanna make a whole company or whatever just for this so im just releasing it for a picocrumb of clout
