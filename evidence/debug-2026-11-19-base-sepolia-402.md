# Debug: Base Sepolia payments rejected with bare 402 (19 Nov 2026)

## Symptom

The first live run (19 Nov ~19:03, engine route) failed all 5 checks with
HTTP 402 "payment required" and $0.00 spent. The memo is in
`runs/2026-11-19T16-03-09-151Z/`. A second run with `--route direct`
(~19:12, `runs/2026-11-19T16-12-07-824Z/`) failed the same way on every
miner tried. The wallet held 20 test USDC on Base Sepolia (verified
on-chain) and 0 Base Sepolia ETH.

## What was ruled out (each tested, not assumed)

1. **Wrong network selected: NO.** The @x402 client filters the 402 accepts
   to networks with a registered scheme before picking; only the Base
   Sepolia accept survived, and the created payload was for eip155:84532
   (see `debug-402-output.txt`, step A2). The parent's hypothesis that
   the client picked the first-listed Eth Sepolia accept was wrong.
2. **Bad signature: NO.** The EIP-712 signature recovers to the wallet
   address, and an eth_call simulation of `transferWithAuthorization`
   against the Base Sepolia USDC contract succeeds (steps A3, A4). The
   challenge's domain parameters (name "USDC", version "2") match the
   contract's own `name()` and `version()`.
3. **Wrong payment header: NO.** Both `PAYMENT-SIGNATURE` (x402 v2, sent
   by the wrapper) and `X-PAYMENT` (v1) got the same bare 402 (steps B, C).
4. **Engine route: NO.** The direct route (`/engine/v1/ask/{minerId}`)
   failed identically on every miner.
5. **Gas: NO.** The x402 facilitator submits the settlement and pays gas;
   the buyer only signs. The wallet needs test USDC, not test ETH.

## Root cause

The devnode's payment verification rejects Base Sepolia payments even
though the 402 challenge advertises them. The payload is valid on-chain,
so the failure is server-side (its verifier/facilitator path for
eip155:84532), not a client bug. Nothing in our code can fix the
server side.

## Evidence that Ethereum Sepolia works

A fellow Season II builder (telegraph-pr-agent, same @x402/fetch +
@x402/evm + viem stack, same paymentConfig pattern) settled live
payments on Ethereum Sepolia: last success 11 Nov 2026, 0.02 USDC to
miner 7314, tx
https://sepolia.etherscan.io/tx/0xa3c9d78b8183f499959a2c4ed138c7e358ffdefb0a97527d6c32ffef1955e954.
Their setup differs from ours in exactly two ways: network (11155111
vs 84532) and route (direct vs engine). Route was eliminated by the
direct-route re-run above, leaving the network.

## Fix

Switched the payment network to Ethereum Sepolia (chain 11155111, USDC
0xcc194e1a843B658526D0D5C431f670028582Ae17, explorer
sepolia.etherscan.io). Changed: `src/config.js`, `src/cli.js` (Sepolia
chain + RPC, 60s timeout because public Sepolia endpoints answer
slowly from this VM), `src/memo.js`, `README.md`, `SUMMARY.md`,
`.env.example`, one explorer assertion in `test/telegraph.test.js`.
Spending caps unchanged ($0.02/call, $1.00/run, 8 requests/run).

Verified after the fix: `npm test` 46/46 pass; `node src/cli.js
balance` reads the Eth Sepolia balance (0.00 USDC, wallet unfunded
there); `node src/cli.js quote` selects the Eth Sepolia accept
($0.01, payTo 0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b).

## Still needed before the live re-run

The wallet needs Ethereum Sepolia test USDC. Fund it from the Circle
faucet (https://faucet.circle.com, choose Ethereum Sepolia, same
address 0x5fe684c303a4aA9d53f02f29Aa800f72C02A0DcA; captcha needs a
browser). No ETH is needed. After funding, re-run:

    node src/cli.js check 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 --chain base --social @circle

Expected cost: about $0.05 testnet USDC for the full 5-check memo.

## Reproduction

`debug-402-repro.mjs` runs the full diagnosis (quote, payload creation,
local signature recovery, on-chain simulation, paid request via the
wrapper, X-PAYMENT retry). Its output is in `debug-402-output.txt`.
It loads the key from `.env` and spends nothing by itself except one
paid request through the wrapper (which the server rejected, $0.00).
