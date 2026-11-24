# ListingCheck

A token-listing verification assistant for the Telegraph Hackathon
Season II, Mission 01 Exchange.

Give it a token contract address. It buys five checks through
Telegraph on testnet (contract audit, on-chain metric, sanctions
screen, wash trading, and a social bot check when you give a handle),
then returns a listing risk memo: a verdict, the evidence behind it,
and a cost line. Each check costs about $0.01 testnet USDC, so a full
memo costs about five cents and takes about a minute.

What works: the full flow, from a token address to a memo with payment
receipts. The checks run in parallel through the Telegraph devnode,
paid with x402 on Ethereum Sepolia. Spending caps are built in ($0.02 per
call, $1.00 per run), and a quote above the cap is refused before
anything is signed.

Try it without funds: `npm install`, then `npm run demo` prints a
full memo on fixture answers. For a real run, fund a fresh testnet
wallet from the Circle faucet and run
`node src/cli.js check <token address> --chain base`. See README.md
for the full instructions.

Known limits: miner answers vary in quality, and the reader marks
anything it cannot parse as inconclusive rather than a pass. The memo
is a starting point for a human reviewer, not a listing decision.
