// One-off ops script (testnet only): fund the Telegraph escrow balance
// for the ListingCheck wallet so asks can pay via the escrow scheme.
// Approves the LedgerFacet to spend USDC, then calls depositUSDC.
//
// Deposit is 0.05 USDC (50,000 atomic units): enough for one full
// 5-check memo run at $0.01 per check. Run once:
//   node scripts/deposit-escrow.mjs
// The amount is a constant on purpose: do not raise it without asking.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { NODE_URL, SEPOLIA_RPC, USDC_ADDRESS } from "../src/config.js";

const DEPOSIT_USDC = 0.05;
const DEPOSIT_ATOMIC = 50_000n;
const LEDGER_FACET = "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const match = envText.match(/^TELEGRAPH_WALLET_PRIVATE_KEY=(.+)$/m);
if (!match) throw new Error("wallet key missing from .env");
const account = privateKeyToAccount(match[1].trim());
console.log("wallet:", account.address);

const transport = http(SEPOLIA_RPC, { timeout: 60_000 });
const wallet = createWalletClient({ account, chain: sepolia, transport });
const pub = createPublicClient({ chain: sepolia, transport });

const erc20Abi = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

const escrowAbi = [
  {
    name: "depositUSDC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
];

const usdcBal = await pub.readContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`USDC balance: ${(Number(usdcBal) / 1e6).toFixed(2)}`);
if (usdcBal < DEPOSIT_ATOMIC) {
  throw new Error(`insufficient USDC: need ${DEPOSIT_USDC}, have ${Number(usdcBal) / 1e6}`);
}

const allowance = await pub.readContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: "allowance",
  args: [account.address, LEDGER_FACET],
});
if (allowance < DEPOSIT_ATOMIC) {
  const approveHash = await wallet.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [LEDGER_FACET, DEPOSIT_ATOMIC],
  });
  console.log("approve tx:", approveHash);
  const approveReceipt = await pub.waitForTransactionReceipt({ hash: approveHash });
  console.log("approve status:", approveReceipt.status);
  if (approveReceipt.status !== "success") throw new Error("approve failed");
} else {
  console.log("allowance already sufficient, skipping approve");
}

const depositHash = await wallet.writeContract({
  address: LEDGER_FACET,
  abi: escrowAbi,
  functionName: "depositUSDC",
  args: [DEPOSIT_ATOMIC],
});
console.log("deposit tx:", depositHash);
const receipt = await pub.waitForTransactionReceipt({ hash: depositHash });
console.log(
  "deposit status:",
  receipt.status,
  "block:",
  receipt.blockNumber,
  "gasUsed:",
  receipt.gasUsed.toString(),
);
if (receipt.status !== "success") throw new Error("depositUSDC failed");

// The node tracks escrow balances in its ledger; confirm it sees the deposit.
const ledgerRes = await fetch(`${NODE_URL}/v1/ledger/account/${account.address}`);
console.log("ledger account status:", ledgerRes.status);
console.log("ledger account:", (await ledgerRes.text()).slice(0, 500));
