# Telegraph escrow payment path — implementation note (19 Nov 2026)

## Why

The devnode's exact-scheme (x402 EIP-3009) payment verification is broken
server-side on Eth Sepolia: valid signed payments are rejected with a bare
402. See `evidence/debug-2026-11-19-eth-sepolia-402.md`. The workaround is
Telegraph's documented escrow scheme, confirmed from the official client
source (`telegraphprotocol/telegraph-mcp`, `src/pay.ts` + `src/chain.ts` +
`docs/architecture.md`).

## The wire format that works

- Header: **`X-PAYMENT`**, value is a base64 JSON envelope:
  `{x402Version: 2, scheme: "escrow", network, payload: {signature, authorization}}`.
- Authorization: `{from, to: payTo, value: amount, validAfter: now-10,
  validBefore: now+60, nonce: "0x" + 32 random bytes}` (all strings; the
  node allows at most a 2-minute window).
- Message: substitute `{from}` (wallet **lowercased**), `{nonce}`,
  `{validAfter}`, `{validBefore}` into the 402's `extra.message` template;
  sign with `personal_sign` (EIP-191). The signature proves intent only;
  it cannot move funds.
- Receipt header for escrow is `X-PAYMENT-RESPONSE` (vs `PAYMENT-RESPONSE`
  for x402). Failed asks are never billed. An identical ask within 1 minute
  is not paid twice (node dedupe).

## What changed

`src/telegraph.js`:
- `escrowAccept(res, network)` parses the escrow option from a 402's
  accepts (requires `extra.message`); `escrowMessage(template,
  authorization)` does the substitution; `escrowPaymentHeader(account,
  accept, nowSeconds)` builds the signed base64 envelope.
- The constructor stores `this.account` for escrow signing.
- `quote()` prefers escrow, falls back to exact; returns `scheme` + `asset`
  (null for escrow).
- `pay()` is escrow-first: 402 quote, guards (price cap, budget),
  `payViaEscrow()` (sign + `X-PAYMENT` via plain fetch), non-402 goes to
  `finishPaid()`. An escrow 402 falls back to the exact rail via
  `paymentFetch` when the 402 offers an exact accept; otherwise
  `AskFailedError`. A network error after signing is a
  `PaymentUnknownError` and is never retried.
- `finishPaid()`: the exact rail keeps strict proof (success true + tx
  string); the escrow rail treats 2xx as success and reads the billed
  amount from the receipt header when present, else the quote. Results
  gain `paymentRail: "escrow" | "exact"`; escrow purchases have empty
  `txHash`/`txUrl`.
- The exact-scheme path is kept as a fallback, not deleted.

`src/config.js`: comment updated (exact broken on both Sepolia networks);
added `ONCHAIN_CHAINS`, `FALLBACK_ETH_BLOCK` (26,386,345, Ethereum head on
19 Nov 2026), `ETHEREUM_RPC` (publicnode).

`src/checks.js`: `validateInput` passes through `block` (positive integer
when present). The on-chain query now follows the intent's canonical
template with an integer block and a supported chain (base/optimism tokens
are read on ethereum). The sanctions query names the address as the
screened entity ("the entity named 0x..."), because the intent's only
required param is `name`. The finding reader learned three live-answer
shapes: a structured `balance_gwei` field counts as a direct read even
when the address is not echoed (and a trailing comma from JSON is not part
of the number), `likely_human` reads as clear, and `"matched":false` reads
as clear instead of tripping the match-word check into a false flag.

`src/cli.js`: `cmdCheck` fetches the Ethereum head block (15 s timeout)
before building checks; on failure it warns and uses the pinned fallback
block. `cmdQuote` prints the scheme and the asset only when present.

`src/ledger.js` / `src/memo.js`: the ledger records `paymentRail`; the memo
prints "Payment: Telegraph escrow (charged to the escrow balance)" for
escrow purchases.

`scripts/deposit-escrow.mjs`: approve + `depositUSDC` on the diamond.

`test/telegraph.test.js`: 11 new escrow tests (accept parsing, message
substitution, header + signature recovery, escrow-first pay, 402 to exact
fallback, no-exact failure, price guard, unknown-error, quote prefers
escrow). `test/checks.test.js`: 8 new tests (on-chain query block/chain,
sanctions entity naming, structured `balance_gwei`, `likely_human`,
`matched:false/true`).

## Funding

- Approve tx: `0x4d314db55cd72e4194aaaf6677a4a847247082198d02c57e81d35c74e1b230b4`
- **Deposit tx: `0x64ddd499c9f48ae947699a1588d046c40a716026bf6bf26a67eec2bad817149e`**
  (block 12169809, gasUsed 184134), 0.05 USDC (50,000 atomic) to
  LedgerFacet `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`, wallet
  `0x5fe684c303a4aA9d53f02f29Aa800f72C02A0DcA`. Node ledger confirmed
  balance 50000, available 50000, deposited 50000, charged 0.
- Note: the node ledger's `charged` figure lags (charges settle into ledger
  roots at epoch boundaries); it still read 0 after $0.05 of successful
  asks. Client-side `spentUsdc` is the reliable record.

## Live results (19 Nov 2026, ~20:20 +03)

Escrow probe (`evidence/escrow-probe.mjs`): the paid on-chain ask returned
HTTP 400, not 402 — the `X-PAYMENT` envelope is accepted. The 400 was a
downstream miner validation error (the old query said "at block latest" and
"on base"; the intent requires an integer block and a chain from
ethereum/polygon/arbitrum). Failed ask, $0 billed.

Full live check:
`node src/cli.js check 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 --chain base --social @circle`

- **Memo: `runs/2026-11-19T17-21-56-950Z/memo.md` — Verdict: DO NOT LIST**
  (wash trading check reported 50% of volume as artificial).
- 4 of 5 checks delivered real answers over escrow: audit (openai, refused
  to audit live contracts, inconclusive), on-chain (LiveCert,
  balance_gwei 10674908377), wash trading (ChainSight, 50% artificial,
  FLAG), social (ChainSight, likely_human). Sanctions failed with HTTP 400
  ("name is required") — the query named no entity.
- **Total spent on the run: $0.04 testnet USDC** (4 x $0.01).

Sanctions probe (`evidence/sanctions-probe.mjs`): with the fixed query,
TxLens answered `{"name":"0x8335...","matched":false,...}` over escrow,
$0.01. The fix is validated live; the next full run should be 5/5.

## Totals

- Deposited: 0.05 USDC. Spent: **$0.05 testnet USDC** (live run $0.04 +
  sanctions probe $0.01; the first escrow probe cost $0). Under the $0.10
  cap. Escrow is now effectively spent; the next full run needs a fresh
  0.05 USDC deposit (ask first, per the task rule).

## Tests

`npm test`: **65/65 pass** (46 prior + 11 escrow + 8 checks/reader).
`node src/cli.js demo` still renders the offline memo.
