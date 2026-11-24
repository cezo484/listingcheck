# ListingCheck: how to get the RIGHT test USDC (Eth Sepolia)

Date: 2026-11-19. Research only, no transactions sent.

## Verdict

No separate faucet is needed. The token the Telegraph devnode accepts,
`0xcc194e1a843B658526D0D5C431f670028582Ae17` on Ethereum Sepolia (chain 11155111),
has a **public, permissionless `mint(address,uint256)`** function. Anyone can mint
any amount to any address. The mint itself is the faucet.

The only missing ingredient is a tiny amount of Sepolia ETH in the wallet to pay
for the mint transaction's gas (about 142k gas, roughly 0.00014 ETH at 1 gwei).
The wallet `0x5fe684c303a4aA9d53f02f29Aa800f72C02A0DcA` currently holds 0 Sepolia ETH.

## What the token is

- Name "USD Coin", symbol USDC, 6 decimals. Read on-chain via Sepolia RPC.
- Total supply about 1,010,000,000,001,006,515 USDC (Sepolia Etherscan token page).
  That absurd supply marks it as a mock/test token, not Circle's USDC.
- 220 holders on Sepolia Etherscan. Source code NOT verified on Etherscan.
- Etherscan notes 5 other contracts with exact matching bytecode, so it is a
  common mock template deployed several times.
- Deployer: not established. The Etherscan contract-creation API needs an API key,
  and the creator field did not render in the text fetch. Not needed for funding.
- It supports EIP-3009 `transferWithAuthorization` (the x402 `exact` scheme) and
  has a DOMAIN_SEPARATOR; `owner()` does not exist (call reverts), so there is no
  owner-gated mint.

## Proof the mint is public

1. Bytecode inspection: selector `40c10f19` (`mint(address,uint256)`) is in the
   dispatcher, and its code path only checks `to != address(0)` (revert message
   "ERC20: mint to the zero address"). No caller check, no role check.
2. Live simulation (read-only `eth_call`, no transaction sent): calling
   `mint(0x5fe684c303a4aA9d53f02f29Aa800f72C02A0DcA, 100_000_000)` from an
   arbitrary unprivileged caller (`0x000000000000000000000000000000000000dEaD`)
   returned success (`0x`, no revert). Same result when simulated from our wallet.
3. Real usage: Sepolia Etherscan shows many distinct wallets calling `Mint` on
   this contract in the last 9 hours alone (for example 0x38452baB9725fC1449E7882c37bD9413c05d8CfC,
   0x6858f04557AAED3a60Ea81fa0b338fc2Aa658e52, 0x8482E592d6B28d3F5B713CC4576D6Ce216B2A78E,
   0x4A072CbDa9544869d9639Cb69fF86e8D6b86862d, 0xb3FB14FEcac09efbD0C74Fc07d50d7eD1eef2B53).
   This is how other Telegraph builders fund their wallets.

## Confirmation this is the canonical Telegraph test token

- Fellow Season II builder telegraph-pr-agent (github.com/borodedamie/telegraph-pr-agent)
  documents it in its README install steps: "Private key of a dedicated, low-balance
  wallet holding Sepolia test USDC (`0xcc194e1a843B658526D0D5C431f670028582Ae17`,
  chain `11155111`). Each answer costs about 0.02 USDC; the facilitator pays gas."
- Their last live purchase (11 Nov 2026, 0.02 USDC) settled in a transaction sent
  to this token contract:
  0xa3c9d78b8183f499959a2c4ed138c7e358ffdefb0a97527d6c32ffef1955e954
  (verified on-chain: tx `to` is the token contract, sent by the facilitator
  0x97d38aa5de015245dcca76305b53abe6da25f6a5).
- The devnode 402 challenge (see evidence/debug-402-output.txt, line A1) lists this
  contract as the only `exact` option on eip155:11155111.

## Why the Circle faucet did not work

The Circle faucet sends a different USDC contract on Ethereum Sepolia
(`0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`, 20 USDC now in the wallet). The
devnode challenge never lists that contract, so those 20 USDC cannot pay for
Telegraph requests. They are stranded for this purpose (harmless, valueless).

## Steps to fund (for the parent agent to execute)

Step 1: get Sepolia ETH into 0x5fe684c303a4aA9d53f02f29Aa800f72C02A0DcA.
The wallet is fresh with no mainnet history, so faucets that require 0.001
mainnet ETH (Alchemy, Google Cloud) will refuse it. Best options, in order:

1. pk910 PoW faucet, https://sepolia-faucet.pk910.de — no account, no mainnet
   balance; the browser mines a short proof-of-work challenge, then you claim.
   Best fit for a fresh wallet.
2. QuickNode faucet — no account or mainnet balance needed for the base amount,
   once every 12 hours.
3. Metana Sepolia faucet — 0.06 ETH per 24h after a Google sign-in, no mainnet
   balance needed.
4. Chainlink faucet (faucets.chain.link) — 0.5 ETH + 25 LINK, but needs a
   connected wallet (MetaMask/WalletConnect), which the cloud browser does not have.

Any of these drips is far more than enough: the mint costs about 142,000 gas
(measured with eth_estimateGas), roughly 0.00014 ETH at 1 gwei.

Step 2: call mint on the token (one on-chain transaction, testnet only):

- Contract: 0xcc194e1a843B658526D0D5C431f670028582Ae17
- Function: mint(address to, uint256 amount)
- Calldata for 100 USDC to our wallet:
  `0x40c10f19` + `0000000000000000000000005fe684c303a4aA9d53f02f29Aa800f72C02A0DcA`
  + `0000000000000000000000000000000000000000000000000000000005f5e100`
  (100 USDC = 100,000,000 atomic units; 20 USDC = 20,000,000 = 0x01312d00).
- 100 USDC is plenty: the full 5-check memo costs about 0.05 USDC.

Step 3: verify with `node src/cli.js balance` (should show the minted amount on
eip155:11155111), then re-run the live check:
`node src/cli.js check 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 --chain base --social @circle`

## Notes and dead ends

- The CDP faucet (faucet.cdp.coinbase.com) could not be checked: the page failed
  to load in the text fetcher. It is listed in Fireblocks x402 docs as a source
  of Base Sepolia ETH; its Sepolia ETH terms are unverified. Not needed given the
  options above.
- The x402.org public facilitator does NOT list eip155:11155111 among its
  supported networks (checked https://x402.org/facilitator/supported live:
  only Base Sepolia, Solana devnet, Algorand, Aptos, Stellar, Hedera, XRPL).
  Telegraph runs its own verify/facilitator path for Eth Sepolia, which matches
  the earlier debug finding.
- The 402 challenge also offers an `escrow` scheme on eip155:11155111, but that
  needs a pre-funded Telegraph escrow balance, which would need the same token.
  The direct mint is simpler.
- No DEX swap is needed. No real money is involved anywhere in this flow.
- Groundline (another Telegraph builder, AadithyaAle/groundline) could not be
  checked: its GitHub repo returned 404.
