# Debug: Eth Sepolia payments rejected with bare 402 (19 Nov 2026, round 2)

## Symptom

After funding the wallet (100 test USDC minted on the devnode's token
0xcc194e1a843B658526D0D5C431f670028582Ae17 + 0.05 Sepolia ETH), the live
run at 19:50 +03 (`runs/2026-11-19T16-50-04-845Z/`) still failed all 5
checks with HTTP 402, $0.00 spent. This round re-traced the x402 flow
end to end with one intent (`ONCHAIN_METRIC_VERIFY_GENERAL`) to find
the exact failure point.

Repro scripts: `evidence/debug-402-eth-sepolia-repro.mjs` (steps A-D)
and `evidence/debug-402-eth-sepolia-repro2.mjs` (steps E1-E5). Outputs:
`evidence/debug-402-eth-sepolia-output.txt`,
`evidence/debug-402-eth-sepolia-output2.txt`. Total spent across all
probes: $0.00 testnet USDC (every paid request was rejected; nothing
settled).

## Root cause

**Server-side.** The devnode's exact-scheme payment verification is
rejecting valid payments on Ethereum Sepolia (and, from round 1, on
Base Sepolia too). The client signs correctly, sends the payment
header, and the payload passes every check the facilitator itself
would run — yet the devnode answers with the same bare 402. The
settlement path behind it looks idle: no `transferWithAuthorization`
call to the token in the last ~80 minutes, and the known facilitator
wallet has sent nothing in at least 3.3 hours. The precise internal
reason is not observable from outside: the devnode returns no
`invalidReason` and exposes no public facilitator endpoint.

This is a regression, not a permanent limitation: the same stack
settled live on Eth Sepolia on 11 Nov 2026 (tx 0xa3c9d78b...). The
round-1 conclusion ("switch to Eth Sepolia") rested on that 8-day-old
data point; the breakage postdates it, or the whole verify service is
down.

## What was proven (each tested, not assumed)

### Client-side: working

1. **The client signs and sends the payment: YES.** With fixed
   logging (the wrapper passes a `Request` object, not `(url, init)`),
   step E1 shows the wrapper making two requests: request 1 unpaid,
   request 2 with a `PAYMENT-SIGNATURE` header (1,124 bytes). The
   round-1 repro's logging had the same blind spot; the conclusion
   then ("wrapper sends the header") is now directly confirmed.
2. **Payload is the right one: YES.** Step A2: `exact`,
   `eip155:11155111`, asset 0xcc194e..., amount 10000, payTo
   0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b.
3. **Signature valid: YES.** Step A3: ecrecover returns the wallet
   address. The challenge's `extra` says name "USD Coin", version
   "2"; the EIP-712 domain separator recomputed from that extra
   matches the token's on-chain `DOMAIN_SEPARATOR` exactly
   (`0xf71b96bf28e312f92956e7aec85346ed0a0e4ecd76f5b5d62293e82187125032`).
   (The token has no `version()` view — it reverts — but the
   separator match proves the domain is right.)
4. **On-chain simulation succeeds: YES.** Step A4: `eth_call` of
   `transferWithAuthorization` with the signed authorization
   succeeds. Balance 100.00 USDC (need 0.01), nonce unused (step A3).
   This is exactly the simulation the facilitator runs in
   `@x402/evm`'s `simulateEip3009Transfer`, plus every check in its
   `diagnoseEip3009SimulationFailure` (nonce, name, version,
   balance) — all pass.
5. **Header name: NOT the issue.** Manual `PAYMENT-SIGNATURE` (E2),
   manual `X-PAYMENT` (C), and both headers together (E3) all get
   the same bare 402. The wrapper is also eliminated: E2 bypasses it
   entirely with the same result.
6. **Route: NOT the issue.** Step D: the direct route (miner #1 7375,
   VerifyWire Onchain Metric Verify) fails identically.

### Server-side: broken

7. **The devnode answers a valid payment with a bare 402.** Step B
   response: status 402, no `payment-response` / `x-payment-response`
   / `x-telegraph-receipt` headers, body identical to the unpaid
   challenge (`{"error": "payment required", "accepts": [...]}` with
   no reason field). Per the standard `@x402/core` server flow, this
   is the response for `verifyPayment` returning `isValid: false` —
   or for any exception inside verify (e.g. the facilitator being
   unreachable). The devnode's body drops the `invalidReason`, so the
   two cannot be distinguished from outside.
8. **No public facilitator endpoint to ask.** Step E4: GET/POST
   `/facilitator/supported`, `/facilitator/verify`,
   `/api/facilitator/supported` all return 404. The invalidReason
   cannot be read directly.
9. **No settlements on-chain recently.** Scanning the last 400 blocks
   (~80 min) for transactions TO the token contract: only 6 txs —
   3x `mint` (including our own mint at block 12169671) and 3x
   `approve`. Zero `transferWithAuthorization` (selector
   `0xe3ee160e`) calls. The known Eth Sepolia facilitator wallet
   `0x97d38aa5de015245dcca76305b53abe6da25f6a5` (sender of the 11 Nov
   settlement, nonce 1290 then) sits at nonce **1837, unchanged for
   at least the last ~3.3 hours** (blocks 12168710–12169710). It
   holds 0.07151 Sepolia ETH, so it is not out of gas money — it is
   simply not sending.
10. **The escrow path next door is live.** In the same window, other
    builders are funding Telegraph escrow: `approve` + `depositUSDC`
    calls to the payTo contract, all succeeding (e.g. 5.0, 0.5, 0.2,
    0.26 USDC at blocks 12169575–12169700). The payTo address
    `0x72a70e...` is itself the LedgerFacet contract: selector
    `0xf688bcfb` on it is `depositUSDC(uint256)`, confirmed by
    selector computation. The 402 challenge advertises this escrow
    scheme alongside `exact`.

## Evidence excerpts

Quote (step A1) — the Eth Sepolia accept:

```json
{
  "amount": "10000",
  "asset": "0xcc194e1a843B658526D0D5C431f670028582Ae17",
  "extra": { "name": "USD Coin", "version": "2" },
  "maxTimeoutSeconds": 60,
  "network": "eip155:11155111",
  "payTo": "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
  "scheme": "exact"
}
```

Wrapper request log (step E1) — the payment header goes out:

```json
[
  { "method": "POST", "hasPaymentSignature": false },
  { "method": "POST", "hasPaymentSignature": true, "paymentSignatureLen": 1124 }
]
```

Paid-request response (steps B, E2, E3, D — all identical): HTTP 402,
`{"error": "payment required", "accepts": [...]}` (same four accepts
as the unpaid challenge), no settlement headers, no reason.

## Fix / workaround

There is no client-side fix for the `exact` scheme: the payload is
valid and the server rejects it. Two options:

### Option 1 (recommended): pay via the escrow scheme

The 402 already advertises it, it is live right now, and it is
Telegraph's documented path (`telegraph_deposit` in telegraph-mcp:
"Deposit USDC from the server wallet into Telegraph escrow by
approving and calling depositUSDC on chain; escrow funds pay for
asks").

1. `approve` the LedgerFacet `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`
   to spend USDC (one tx, needs a little Sepolia ETH for gas — the
   wallet has 0.05).
2. Call `LedgerFacet.depositUSDC(amount)` — 1 USDC covers 100
   requests at $0.01; 0.05 USDC covers one full 5-check memo.
3. Per request, sign the EIP-191 `personal_sign` message from the
   402's escrow `extra` (template below) and send it as the escrow
   payment. This needs a small code change in `src/telegraph.js`:
   the `@x402` client does not implement Telegraph's custom escrow
   scheme, so the escrow path must be hand-rolled (sign message,
   attach as the payment header the devnode expects for `escrow` —
   the exact header name needs one probe against the live node).

Escrow message template (from the live 402 `extra.message`):

```
Telegraph Escrow Payment

Wallet: {from}
Pay To: 0x72a70e949362670bf8bcead24efc5b8f950aa08b
Network: eip155:11155111
Amount: 10000 uUSDC
Resource: /v1/ask
Nonce: {nonce}
Valid After: {validAfter}
Valid Before: {validBefore}
```

Notes: the LedgerFacet is a Diamond proxy (287-byte dispatcher);
no `balanceOf`/`escrowBalance`-style view under the obvious names
exists on it — the escrow balance is tracked in the devnode's
ledger ("Charged to the caller's Telegraph escrow balance in the
next ledger block"), verifiable via Telegraph's `telegraph_account`.
Withdrawing is documented in `telegraph_docs` topic "payments".

### Option 2: wait / ask Telegraph

The outage may be transient (facilitator restart, RPC issue), and
the exact path demonstrably worked 8 days ago. Retry the live check
later, and/or ask in Telegraph's Discord whether exact-scheme
verification is down. If it recovers, no code change is needed —
the current client is already correct.

## What was ruled out (summary)

Wrong network, bad signature, EIP-712 domain mismatch, insufficient
balance, used nonce, missing/wrong payment header, wrapper bug,
engine-vs-direct route, facilitator out of gas — all tested and
eliminated. The failure is the devnode's exact-scheme verification
rejecting a valid payment, with the settlement path idle on-chain.
