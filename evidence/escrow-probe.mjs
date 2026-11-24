// Live escrow probe (testnet only): one ask through the real client
// code path, to confirm the escrow X-PAYMENT envelope works against
// the devnode and to see the success response headers. Uses the exact
// onchain query the live check sends, so a live run within a minute
// gets the same answer from the node's dedupe instead of paying twice.
//
// Costs $0.01 testnet USDC from the pre-funded escrow balance when the
// ask succeeds; a refused ask costs nothing.
import { readFileSync } from "node:fs";
import { NODE_URL } from "../src/config.js";
import { TelegraphClient } from "../src/telegraph.js";

const ROOT = new URL("..", import.meta.url).pathname;
for (const line of readFileSync(`${ROOT}/.env`, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined)
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const INTENT = "ONCHAIN_METRIC_VERIFY_GENERAL";
const QUERY =
  "What is the native-coin balance, in Gwei, of address 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 on base at block latest?";

const log = [];
const loggingFetch = async (url, init) => {
  const headers = new Headers(init?.headers);
  const res = await fetch(url, init);
  const interesting = {};
  for (const [k, v] of res.headers.entries()) {
    if (k.includes("payment") || k.includes("receipt") || k.includes("telegraph")) {
      interesting[k] = v.slice(0, 300);
    }
  }
  log.push({
    url: String(url),
    xPayment: headers.has("X-PAYMENT"),
    status: res.status,
    headers: interesting,
  });
  return res;
};

const client = new TelegraphClient({
  privateKey: process.env.TELEGRAPH_WALLET_PRIVATE_KEY,
  maxPricePerCallUsdc: 0.02,
  budgetCapUsdc: 1.0,
  fetchImpl: loggingFetch,
});

const ledgerBefore = await (
  await fetch(`${NODE_URL}/v1/ledger/account/${client.account.address}`)
).json();
console.log("escrow before: balance", ledgerBefore.balance, "charged", ledgerBefore.charged);

try {
  const p = await client.buyRouted(INTENT, QUERY);
  console.log("\nPROBE OK");
  console.log("rail:", p.paymentRail);
  console.log("miner:", p.minerName, "(id", p.minerId + ")");
  console.log("amountUsdc:", p.amountUsdc);
  console.log("receiptHash:", p.receiptHash);
  console.log("signalHash:", p.signalHash);
  console.log("answer:", p.answer.slice(0, 300));
} catch (err) {
  console.log("\nPROBE FAILED:", err.constructor.name, "-", String(err.message).slice(0, 500));
  process.exitCode = 1;
}

console.log("\nrequests:", JSON.stringify(log, null, 2));
const ledgerAfter = await (
  await fetch(`${NODE_URL}/v1/ledger/account/${client.account.address}`)
).json();
console.log("\nescrow after: balance", ledgerAfter.balance, "charged", ledgerAfter.charged);
console.log("client spentUsdc:", client.spentUsdc);
