# ListingCheck

ListingCheck checks whether a token is ready for an exchange listing.
You give it a token contract address, and it buys five pieces of
intelligence through Telegraph, one per check, then returns a listing
risk memo with a cost line at the bottom.

    node src/cli.js check 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 --chain base

The memo says LIST, REVIEW, or DO NOT LIST, and every line of the
verdict names the evidence behind it. The memo is the evidence pack a
human reviewer starts from. It is not a listing decision.

Built for the Telegraph Hackathon Season II, Mission 01 Exchange,
track Apps and Agents.

## How it works

1. Checks. The token address turns into four queries, plus a fifth when
   you give a social handle:
   - Contract audit (`SMART_CONTRACT_AUDIT_GENERAL`): reentrancy, access
     control, integer overflow risks in the token contract.
   - On-chain metric (`ONCHAIN_METRIC_VERIFY_GENERAL`): the token
     contract balance at the latest block, read from the chain.
   - Sanctions screen (`SANCTIONS_SCREENING_MATCH_GENERAL`): the token
     address against OFAC, EU, and UN consolidated lists.
   - Wash trading (`WASH_TRADING_DETECTION_GENERAL`): circular transfers
     between affiliated wallets, and the share of volume that looks
     artificial.
   - Social bot check (`SOCIAL_BOT_DETECTION_GENERAL`): whether the
     project account looks automated or coordinated.
2. Buy. Each check is a real Telegraph purchase on testnet. The app
   sends an unpaid request, reads the live price from the 402 challenge,
   checks it against its caps, then signs an x402 payment authorization
   and retries. The facilitator settles the payment on chain. The buyer
   only signs; it needs test USDC but no gas token.
3. Read. Miner answers are free text, so the reader is conservative: a
   check it cannot parse is "inconclusive", never a pass. The raw
   answer stays next to the reading, so a human can check it.
4. Memo. A fixed rule turns the check outcomes into a verdict. A
   sanctions match, a critical audit finding, or wash trading above
   half the volume blocks. Anything cautionary, unreadable, or failed
   goes to human review. Only a memo where every check came back clear
   recommends listing, and even then a human still signs off.

The checks run in parallel. A failed check does not stop the others;
it is recorded as failed in the memo.

## Quick start

Node 18 or newer.

    npm install
    npm test          # run the test suite
    npm run demo      # full memo on fixture answers, no network, no payment

For a real run you need a testnet wallet with test USDC:

1. Generate a fresh wallet. Use a new address only for this project,
   and never put a real wallet key here.
2. Copy `.env.example` to `.env` and put the key in
   `TELEGRAPH_WALLET_PRIVATE_KEY`.
3. Fund the wallet from the Circle testnet faucet at
   https://faucet.circle.com: choose Ethereum Sepolia, paste the address,
   pass the captcha. The faucet gives test USDC per request.
4. Check the balance: `node src/cli.js balance`

## Commands

    node src/cli.js check <token> [--chain base] [--social @handle]
        [--claim "..."] [--route engine|direct] [--out dir]
      Buy the listing checks and print the memo. Each check costs about
      $0.01 testnet USDC, so a full run costs about $0.04 to $0.05.
      The memo and the spend ledger are saved under runs/<timestamp>/
      (or the directory given with --out). The default route is engine:
      Telegraph picks the miner. With --route direct the app pays the
      top-ranked miner from the leaderboard itself, and the memo says so.

    node src/cli.js quote <intent> "<query>"
      Show the live 402 price for a request. Unpaid, signs nothing.

    node src/cli.js balance
      Show the testnet USDC balance of the wallet in .env.

    node src/cli.js intents
      List the Mission 01 intents with live miner counts from the node.

    node src/cli.js demo
      Run the full memo on fixture answers. No network, no payment.
      The output is labelled a demo.

## Costs and limits

The live quote on 19 Nov 2026 was $0.01 per request on every Mission 01
intent. Prices come from the 402 challenge at run time; the app never
assumes a price.

Spending limits are built in, and the environment can only lower them:

- Per call: $0.02 USDC maximum. A quote above the cap is refused and
  nothing is paid.
- Per run: $1.00 USDC maximum. Before buying anything, the app checks
  that the worst case (every check at the per-call cap) fits the
  budget.
- Per run: 8 requests maximum.

The signer also carries the per-call cap, so a price change between
the quote and the payment cannot overspend. When a paid request gets
no response, or answers without a readable settlement proof, the app
stops with an "outcome unknown" error instead of retrying: the payment
may have settled, and retrying would charge again.

## Network

Everything runs on testnet. Payments settle in testnet USDC on Ethereum
Sepolia (chain 11155111, USDC 0xcc194e1a843B658526D0D5C431f670028582Ae17).
The devnode also advertises Base Sepolia, but it rejects payments there
(every paid request came back with a bare 402 on 19 Nov 2026, on both
routes, with a valid payload); Ethereum Sepolia is the network with a
proven live settlement. See evidence/debug-2026-11-19-base-sepolia-402.md.
Requests go to the Telegraph devnode at
https://devnode.telegraphprotocol.com. Testnet use is never presented
as production use.

Testnet wallet used for the demo run in this repository (testnet only,
no real funds, no mainnet use):

    0x5fe684c303a4aA9d53f02f29Aa800f72C02A0DcA

## Evidence

The evidence directory holds dated snapshots from the live node:

- `intent-*.json`: the six Mission 01 intents as served on 19 Nov 2026
  (miner counts, lifecycle state).
- `miners-*.json`: the active miner lists for each intent, with scores
  and ranks.
- `quote-2026-11-19-*.json`: the live 402 challenge for an on-chain
  metric request, showing the $0.01 price on Ethereum Sepolia.

Each real run also saves its own `memo.json` and `ledger.json` under
`runs/`, with the payment transaction, receipt hash, and signal hash
for every request.

## Known limitations

- The audit intent (`SMART_CONTRACT_AUDIT_GENERAL`) has no response
  format on the node, so its answer is free text and the reader can
  only look for severity words. A human reads the full answer in the
  memo.
- Miner answers vary in quality. Some miners answer a different
  question than the one asked. The memo flags answers that do not
  mention the subject, and the reader never turns an unreadable answer
  into a pass.
- The on-chain check reads the token contract balance at the latest
  block. It does not count holders or read token balances.
- The verdict rule is fixed and simple. It is a starting point for a
  human reviewer, not a substitute for one.
- Telegraph routing can send a query to a miner for a different
  intent. The memo records the miner that served each request, so the
  routing is visible. Use `--route direct` to pick the miner from the
  leaderboard instead.

## Files

    src/config.js      Node URL, chain, USDC, intents, spending caps
    src/telegraph.js   Devnode client and the x402 payment flow
    src/checks.js      Check queries and answer reading
    src/memo.js        Verdict rule and memo rendering
    src/ledger.js      Spend ledger records
    src/demo.js        Fixture run for reproduction without funds
    src/cli.js         Command line interface
    test/              Unit tests (node:test, no framework)
    evidence/          Dated snapshots from the live node
