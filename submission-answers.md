# ListingCheck — H2 submission answers

Prepared for the Telegraph Hackathon Season II final submission form
(rules Section 8, deadline 1 Dec 2026 23:59 UTC). Copy each section
into the matching form field. Everything here is testnet only; no
production or real-customer claims are made anywhere.

## 1. Project details

- Team: solo
- Contact / GitHub username: cezo484
- Track: Apps & Agents
- Mission: Mission 01 Exchange
- Project name: ListingCheck
- Repository: https://github.com/cezo484/listingcheck
- Bounties repo starred by: cezo484
  (https://github.com/telegraphprotocol/bounties)
- Intents used:
  - SMART_CONTRACT_AUDIT_GENERAL
  - ONCHAIN_METRIC_VERIFY_GENERAL
  - SANCTIONS_SCREENING_MATCH_GENERAL
  - WASH_TRADING_DETECTION_GENERAL
  - SOCIAL_BOT_DETECTION_GENERAL
- Reviewer-access link: the repository above (public). The demo runs
  with no wallet and no funds (`npm run demo`).

## 2. Short demo video

- File: `demo/listingcheck-demo.mp4` (2-5 minutes, screen recording)
- Status: PENDING — the video is produced separately and was not in
  the project directory when this document was written (24 Nov 2026).
  Add the file under `demo/` before submitting, and paste its public
  link here.
- Planned flow (rules Section 8): problem, Telegraph request, returned
  intelligence and Provider evidence, observed cost, completed result,
  how to try it.
- Public link: (pending)

## 3. How to run it

Prerequisites: Node 18 or newer. No wallet or funds needed for the
demo; a real run needs a fresh testnet wallet with test USDC.

Install and demo (no network, no payment):

    npm install
    npm test          # run the test suite (65 tests)
    npm run demo      # full memo on fixture answers, labelled a demo

Real run (testnet):

1. Generate a fresh wallet. Use a new address only for this project,
   and never put a real wallet key here.
2. Copy `.env.example` to `.env` and put the key in
   `TELEGRAPH_WALLET_PRIVATE_KEY`.
3. Fund the wallet from the Circle testnet faucet
   (https://faucet.circle.com): choose Ethereum Sepolia, paste the
   address, pass the captcha.
4. Check the balance: `node src/cli.js balance`
5. Run a check:
   `node src/cli.js check 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 --chain base`
   Add `--social @handle` for the fifth check, `--claim "..."` to
   verify a listing claim, `--route direct` to pay the top-ranked
   miner from the leaderboard instead of letting Telegraph route.

Sample request and expected result: the command above buys four
checks (five with `--social`), prints a memo with the verdict LIST,
REVIEW, or DO NOT LIST, one section per check with the miner answer,
and a cost line. The memo and the spend ledger are saved under
`runs/<timestamp>/`.

Network used: Ethereum Sepolia testnet (chain 11155111), testnet USDC
(0xcc194e1a843B658526D0D5C431f670028582Ae17). Requests go to the
Telegraph devnode at https://devnode.telegraphprotocol.com. The
devnode also advertises Base Sepolia but rejects payments there (see
`evidence/debug-2026-11-19-base-sepolia-402.md`); Ethereum Sepolia is
the network with a proven live settlement. Testnet use is never
presented as production use.

Spending limits and costs: the live quote on 19 Nov 2026 was $0.01
per request on every Mission 01 intent, so a full memo costs about
$0.04 to $0.05 in testnet USDC. Prices come from the 402 challenge at
run time; the app never assumes a price. Built-in caps: $0.02 USDC
maximum per call (a quote above the cap is refused, nothing is paid),
$1.00 USDC maximum per run, 8 requests maximum per run. The signer
also carries the per-call cap, so a price change between the quote
and the payment cannot overspend. When a paid request gets no
response, or answers without a readable settlement proof, the app
stops with an "outcome unknown" error instead of retrying, because
the payment may have settled and retrying would charge again.

Known limitations:

- The audit intent has no response format on the node, so its answer
  is free text and the reader can only look for severity words. A
  human reads the full answer in the memo.
- Miner answers vary in quality. Some miners answer a different
  question than the one asked. The memo flags answers that do not
  mention the subject, and the reader never turns an unreadable
  answer into a pass.
- The on-chain check reads the token contract balance at the latest
  block. It does not count holders or read token balances.
- The verdict rule is fixed and simple. It is a starting point for a
  human reviewer, not a substitute for one.
- Telegraph routing can send a query to a miner for a different
  intent. The memo records the miner that served each request, so the
  routing is visible. Use `--route direct` to pick the miner from the
  leaderboard instead.

## 4. Evidence

All evidence is in the repository:

- `evidence/intent-*.json`: the six Mission 01 intents as served on
  19 Nov 2026 (miner counts, lifecycle state).
- `evidence/miners-*.json`: the active miner lists for each intent,
  with scores and ranks.
- `evidence/quote-2026-11-19-*.json`: the live 402 challenge for an
  on-chain metric request, showing the $0.01 price on Ethereum
  Sepolia.
- `runs/<timestamp>/`: seven real testnet runs from 19 Nov 2026, each
  with `memo.json`, `memo.md`, and `ledger.json`, including the
  payment transaction, receipt hash, and signal hash for every
  request.
- `evidence/debug-2026-11-19-base-sepolia-402.md` and
  `evidence/debug-2026-11-19-eth-sepolia-402.md`: the Base Sepolia
  payment rejection and the working Ethereum Sepolia settlement,
  documented with reproduction scripts.
- Tests: 65 tests pass, 0 fail (verified 24 Nov 2026, `npm test`,
  node:test, no framework). Test files: `test/checks.test.js`,
  `test/telegraph.test.js`.
- Testnet wallet used for the demo runs (testnet only, no real
  funds, no mainnet use): 0x5fe684c303a4aA9d53f02f29Aa800f72C02A0DcA

## 5. Short public summary

ListingCheck is a token-listing verification assistant for Mission 01
Exchange. Give it a token contract address and it buys five checks
through Telegraph on testnet (contract audit, on-chain metric,
sanctions screen, wash trading, and a social bot check when you give
a handle), then returns a listing risk memo: a verdict, the evidence
behind it, and a cost line. Each check costs about $0.01 testnet
USDC, so a full memo costs about five cents and takes about a minute.

What works: the full flow, from a token address to a memo with
payment receipts. The checks run in parallel through the Telegraph
devnode, paid with x402 on Ethereum Sepolia. Spending caps are built
in ($0.02 per call, $1.00 per run), and a quote above the cap is
refused before anything is signed.

Try it without funds: `npm install`, then `npm run demo` prints a
full memo on fixture answers. For a real run, fund a fresh testnet
wallet from the Circle faucet and run
`node src/cli.js check <token address> --chain base`. See README.md
for the full instructions. Contributions are welcome via issues and
pull requests on the repository.

Known limits: miner answers vary in quality, and the reader marks
anything it cannot parse as inconclusive rather than a pass. The memo
is a starting point for a human reviewer, not a listing decision.

Public updates (growth evidence, rules Section 6, 20 points):

- Day 1 (problem and what ListingCheck does): (live X URL pending)
- Day 2 (technical progress, intents, x402 flow, spending caps):
  (live X URL pending)
- Day 3 (working result, how to try it, honest limits):
  (live X URL pending)
- Drafts: `updates/day1.md`, `updates/day2.md`, `updates/day3.md`
- Independent developer testing or adoption: none claimed. No
  third-party use is reported; the growth evidence is the three
  public updates and the reproducible repository.

## 6. Commercial summary (five short questions)

1. Who is the user or buyer? A listings desk at a spot or derivatives
   exchange: the analyst who reviews token listing applications, and
   the compliance officer who signs off on them. Smaller venues
   without a full research team get the most from it.
2. How often does the problem occur? Every listing application. A
   mid-size venue reviews several tokens a week, and each review takes
   days to weeks of analyst time today. Fake listing announcements
   also appear daily.
3. What does the buyer pay today, and what would they pay for this?
   Today the buyer pays analyst time (days of work per listing) plus
   separate subscriptions for sanctions screening and on-chain data.
   ListingCheck buys the same evidence per listing for about five
   cents of intelligence on testnet pricing, and returns the memo in
   about a minute. A venue would pay per memo, or a flat monthly fee
   for a number of memos, and keep the human sign-off.
4. What is the finished result the buyer gets? A signed listing risk
   memo: a verdict (list, review, or do not list), one section per
   check with the miner answer verbatim, the payment transaction,
   receipt hash, and signal hash for every request, and a cost line
   at the bottom. The memo is the evidence pack the reviewer starts
   from.
5. What would make a buyer trust it? Every claim in the memo traces
   to a paid request with a receipt, so the buyer can re-check each
   input. The reader is conservative: an answer it cannot parse is
   marked inconclusive, never a pass. And the memo never claims to be
   the decision: a human still signs off, and the tool says so on
   every memo.

## 7. Showcase permission

Telegraph may share publicly, with credit to cezo484: the project
summary and description text, the repository, the demo video and
screen recordings, the public X updates, and any tutorial or
walkthrough derived from this project. Buyer introductions: yes, I
agree to possible buyer introductions.

## 8. Honesty notes

- All results are testnet results (Ethereum Sepolia). No production
  deployment and no real customers are claimed.
- Costs are testnet USDC at the observed 19 Nov 2026 quote of $0.01
  per request; prices come from the live 402 challenge at run time.
- No independent developer adoption is claimed. Growth evidence is
  the three public updates plus the reproducible repository.
- No private keys, wallet secrets, or credentials are included in
  this submission or in the repository. `.env` is excluded by
  `.gitignore`; only `.env.example` ships.
