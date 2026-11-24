// Configuration for ListingCheck. Testnet only. Every value here is a
// default the operator can override with an environment variable; the
// spending caps have hard upper bounds that no override can pass.

export const NODE_URL =
  process.env.TELEGRAPH_NODE_URL || "https://devnode.telegraphprotocol.com";

// Payment network: Ethereum Sepolia. The live 402 challenge offers
// exact USDC on eip155:11155111 (this USDC contract) and on
// eip155:84532, plus an escrow option on eip155:11155111. The devnode
// rejects exact payments on BOTH Sepolia networks as of 19 Nov 2026:
// every paid request came back with a bare 402, on both the engine
// route and the direct route, even though the payload was valid
// (signature recovers to the wallet, and an eth_call simulation of
// transferWithAuthorization succeeds). Escrow is the working rail:
// the client signs the challenge's escrow message and the node
// charges the pre-funded escrow balance (scripts/deposit-escrow.mjs).
// See evidence/debug-2026-11-19-base-sepolia-402.md and
// evidence/debug-2026-11-19-eth-sepolia-402.md.
export const CHAIN_ID = 11155111;
export const NETWORK = `eip155:${CHAIN_ID}`;
export const USDC_ADDRESS = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
export const USDC_DECIMALS = 1_000_000;
export const EXPLORER = "https://sepolia.etherscan.io";
export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// Spending limits. The live quote on 19 Nov 2026 was $0.01 per request.
// A quote above the per-call cap is refused, never paid. The run budget
// stops the run before it can overspend. The caps below are the maximum
// the code accepts; env overrides can only lower them.
export const MAX_PRICE_PER_CALL_USDC = 0.02;
export const BUDGET_CAP_USDC = 1.0;
export const MAX_REQUESTS_PER_RUN = 8;

// Mission 01 Exchange intents, canonical ids as served by the live node
// on 19 Nov 2026. Each check below names the intent it buys and the
// question it asks. The audit intent has no response format on the node
// (state "registered"), so its answer is treated as free text.
export const INTENTS = {
  audit: {
    id: "SMART_CONTRACT_AUDIT_GENERAL",
    label: "Contract audit",
    description:
      "Inspects the token contract for reentrancy, access control, and integer overflow risks.",
  },
  onchain: {
    id: "ONCHAIN_METRIC_VERIFY_GENERAL",
    label: "On-chain metric",
    description:
      "Reads a value directly from the chain: the native-coin balance of the address at a stated block, in Gwei. The intent serves only ethereum, polygon and arbitrum, so a token on another chain is read on ethereum.",
  },
  sanctions: {
    id: "SANCTIONS_SCREENING_MATCH_GENERAL",
    label: "Sanctions screen",
    description:
      "Screens the token contract address against OFAC, EU, and UN consolidated sanctions lists.",
  },
  wash: {
    id: "WASH_TRADING_DETECTION_GENERAL",
    label: "Wash trading",
    description:
      "Checks whether trading volume on the token looks artificial: circular transfers between affiliated wallets.",
  },
  social: {
    id: "SOCIAL_BOT_DETECTION_GENERAL",
    label: "Social bot check",
    description:
      "Checks whether a social account looks automated or coordinated. Only runs when the operator gives a handle.",
  },
};

// Chains the checks can name in a query. The address itself is validated
// as an EVM address; the chain name is passed to the miner in the query
// text, so only names the miners understand are allowed.
export const CHAINS = ["base", "ethereum", "arbitrum", "polygon"];

// Chains the ONCHAIN_METRIC_VERIFY intent serves. Its declared request
// schema allows only ethereum, polygon and arbitrum, and requires an
// integer block: a query naming "base" or "block latest" is refused
// with HTTP 400 invalid_params (proven live 19 Nov 2026). A token on
// another chain is therefore read on ethereum at a stated block.
export const ONCHAIN_CHAINS = ["ethereum", "polygon", "arbitrum"];
// Ethereum head block on 19 Nov 2026. Used for the onchain query only
// when the live head-block lookup fails; the CLI normally fetches the
// current head before the run.
export const FALLBACK_ETH_BLOCK = 26386345;
export const ETHEREUM_RPC = "https://ethereum-rpc.publicnode.com";

export function loadLimits(env = process.env) {
  const perCall = Number(env.LISTINGCHECK_MAX_PRICE_USDC);
  const budget = Number(env.LISTINGCHECK_BUDGET_USDC);
  return {
    maxPricePerCallUsdc:
      Number.isFinite(perCall) && perCall > 0
        ? Math.min(perCall, MAX_PRICE_PER_CALL_USDC)
        : MAX_PRICE_PER_CALL_USDC,
    budgetCapUsdc:
      Number.isFinite(budget) && budget > 0
        ? Math.min(budget, BUDGET_CAP_USDC)
        : BUDGET_CAP_USDC,
    maxRequestsPerRun: MAX_REQUESTS_PER_RUN,
  };
}
