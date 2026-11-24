# Listing risk memo

Token: `0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913` on base
Social: @circle
Run: 2026-11-19T17:28:57.883Z to 2026-11-19T17:29:23.765Z (UTC)
Network: testnet (Ethereum Sepolia payments, Telegraph devnode)

## Verdict: REVIEW

- Contract audit check failed to run, so the memo is incomplete.
- Sanctions screen check failed to run, so the memo is incomplete.
- Wash trading check failed to run, so the memo is incomplete.
- Social bot check check failed to run, so the memo is incomplete.

## Checks

### Contract audit: FAILED

Intent: `SMART_CONTRACT_AUDIT_GENERAL`
Miner: unknown (id unknown, route unknown)
Cost: $0.00 USDC (testnet)

Summary: HTTP 402 {
  "error": "payment required",
  "accepts": [
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:11155111",
      "payTo": "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b"
    },
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:84532

Answer (verbatim, truncated to 2000 characters):

```

```

### On-chain metric: clear

Intent: `ONCHAIN_METRIC_VERIFY_GENERAL`
Miner: LiveCert — Sourced Answers for Agents (id 4433, route engine)
Cost: $0.01 USDC (testnet)
Payment: Telegraph escrow (charged to the escrow balance)
Signal hash: 0x93f7170c70612d04813175f05bb0ffbc1694dea01c831b23ae9bdb71c5eaad06
Latency: 25.9s

Summary: On-chain balance reported as 10674908377.

Answer (verbatim, truncated to 2000 characters):

```
{"balance_gwei":10674908377,"address":null,"block":null,"chain":null,"tx_count":null}
```

### Sanctions screen: FAILED

Intent: `SANCTIONS_SCREENING_MATCH_GENERAL`
Miner: unknown (id unknown, route unknown)
Cost: $0.00 USDC (testnet)

Summary: HTTP 402 {
  "error": "payment required",
  "accepts": [
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:11155111",
      "payTo": "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b"
    },
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:84532

Answer (verbatim, truncated to 2000 characters):

```

```

### Wash trading: FAILED

Intent: `WASH_TRADING_DETECTION_GENERAL`
Miner: unknown (id unknown, route unknown)
Cost: $0.00 USDC (testnet)

Summary: HTTP 402 {
  "error": "payment required",
  "accepts": [
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:11155111",
      "payTo": "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b"
    },
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:84532

Answer (verbatim, truncated to 2000 characters):

```

```

### Social bot check: FAILED

Intent: `SOCIAL_BOT_DETECTION_GENERAL`
Miner: unknown (id unknown, route unknown)
Cost: $0.00 USDC (testnet)

Summary: HTTP 402 {
  "error": "payment required",
  "accepts": [
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:11155111",
      "payTo": "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b"
    },
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "eip155:84532

Answer (verbatim, truncated to 2000 characters):

```

```

## Cost line

Requests: 5
Total spent: $0.01 USDC (testnet)

Verification hash: 83d3d657aafc1c66369d6037f1d78fa8a76496ae2b284e5dcc5be7585d57a5b3

This memo is a testnet prototype built for a hackathon. It is not a listing decision and not financial advice. A human reviewer checks the evidence before any listing.
