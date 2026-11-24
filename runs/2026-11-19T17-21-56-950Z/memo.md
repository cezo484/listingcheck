# Listing risk memo

Token: `0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913` on base
Social: @circle
Run: 2026-11-19T17:21:25.703Z to 2026-11-19T17:21:56.944Z (UTC)
Network: testnet (Ethereum Sepolia payments, Telegraph devnode)

## Verdict: DO NOT LIST

- Wash trading check reported half or more of volume as artificial.

## Checks

### Contract audit: inconclusive

Intent: `SMART_CONTRACT_AUDIT_GENERAL`
Miner: openai (id openai, route engine)
Cost: $0.01 USDC (testnet)
Payment: Telegraph escrow (charged to the escrow balance)
Signal hash: 0xf6d3b8b440ccf34ecf1562a876ffb13178b337a25dcf240932212cfc4dd1a527
Latency: 5.3s

Summary: The audit answer could not be read as a clear pass or fail.

Answer (verbatim, truncated to 2000 characters):

```
I am sorry, but I cannot directly audit smart contracts on live blockchains. My capabilities do not include real-time interaction with blockchain networks or the execution of smart contract code in a live environment. Therefore, I cannot provide an audit for the smart contract at address 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 on Base for reentrancy, access control, and integer overflow risks.

To get an audit, you would need to engage a professional smart contract auditing firm or use specialized blockchain security analysis tools that can interact with the live network or analyze the contract's bytecode.
```

### On-chain metric: inconclusive

Intent: `ONCHAIN_METRIC_VERIFY_GENERAL`
Miner: LiveCert — Sourced Answers for Agents (id 4433, route engine)
Cost: $0.01 USDC (testnet)
Payment: Telegraph escrow (charged to the escrow balance)
Signal hash: 0xd87356779d324d6c704b7b84f6c1c931430c6d57ed8e62028c143c2800aabc0d
Latency: 31.2s

Summary: On-chain balance reported as 10674908377,.

Answer (verbatim, truncated to 2000 characters):

```
{"balance_gwei":10674908377,"address":null,"block":null,"chain":null,"tx_count":null}
```

### Sanctions screen: FAILED

Intent: `SANCTIONS_SCREENING_MATCH_GENERAL`
Miner: unknown (id unknown, route unknown)
Cost: $0.00 USDC (testnet)

Summary: HTTP 400 {"error":"invalid_params","intent":"SANCTIONS_SCREENING_MATCH_GENERAL","message":"name is required (string)","problems":[{"param":"name","code":"missing","message":"name is required (string)"}],"schema_version":3}

Answer (verbatim, truncated to 2000 characters):

```

```

### Wash trading: FLAG

Intent: `WASH_TRADING_DETECTION_GENERAL`
Miner: ChainSight — Universal Intelligence & Data Oracle (id 302, route engine)
Cost: $0.01 USDC (testnet)
Payment: Telegraph escrow (charged to the escrow balance)
Signal hash: 0xcfdf62a4225ef3aedd2bb005166e89f0f03cf6c4f31223c8c00486b1663bf52d
Latency: 19.9s

Summary: The answer reports 50% of volume as artificial.

Answer (verbatim, truncated to 2000 characters):

```
{"subject":"0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913","verdict":"likely_wash_trading","wash_volume_pct":50,"signals":["24h volume $216,463 is 10.0x the pool's $21,586 liquidity","Buys and sells are almost equal (628 vs 655), as round-trip trading leaves them"],"summary":"The USDC/USDbC on uniswap (base) pool shows signs of wash trading. An estimated 50% of its volume is above a generous organic turnover of 5x liquidity a day."}
```

### Social bot check: inconclusive

Intent: `SOCIAL_BOT_DETECTION_GENERAL`
Miner: ChainSight — Universal Intelligence & Data Oracle (id 302, route engine)
Cost: $0.01 USDC (testnet)
Payment: Telegraph escrow (charged to the escrow balance)
Signal hash: 0xa0fa40e198756910d70f04192a655bd32cc35539aa750a957792990a557c6a86
Latency: 10.0s

Summary: The answer could not be read as a clear bot verdict.

Answer (verbatim, truncated to 2000 characters):

```
{"account":"@circle","verdict":"likely_human","bot_score":null,"signals":["likely_human - the single, context‑less mention \"@circle\" provides too little patterned behavior to indicate automated activity."]}
```

## Cost line

Requests: 5
Total spent: $0.04 USDC (testnet)

Verification hash: 49c1a62705fd468af5a0814b92ffe043f9fcce77c0a527d89fedb0d1735650ae

This memo is a testnet prototype built for a hackathon. It is not a listing decision and not financial advice. A human reviewer checks the evidence before any listing.
