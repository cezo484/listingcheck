// Live sanctions probe (testnet only): buys just the sanctions check
// through the real client, using the query buildChecks produces, to
// confirm the "entity named <address>" phrasing satisfies the intent's
// required `name` param. Costs $0.01 from escrow on success; a refused
// ask costs nothing.
import { readFileSync } from "node:fs";
import { NODE_URL } from "../src/config.js";
import { TelegraphClient } from "../src/telegraph.js";
import { buildChecks } from "../src/checks.js";

const ROOT = new URL("..", import.meta.url).pathname;
for (const line of readFileSync(`${ROOT}/.env`, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined)
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const check = buildChecks({
  token: "0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913",
  chain: "base",
}).find((c) => c.key === "sanctions");
console.log("query:", check.query);

const client = new TelegraphClient({
  privateKey: process.env.TELEGRAPH_WALLET_PRIVATE_KEY,
  maxPricePerCallUsdc: 0.02,
  budgetCapUsdc: 1.0,
});

const ledgerBefore = await (
  await fetch(`${NODE_URL}/v1/ledger/account/${client.account.address}`)
).json();
console.log("escrow before: balance", ledgerBefore.balance, "charged", ledgerBefore.charged);

try {
  const p = await client.buyRouted(check.intent, check.query);
  console.log("\nSANCTIONS PROBE OK");
  console.log("rail:", p.paymentRail);
  console.log("miner:", p.minerName, "(id", p.minerId + ")");
  console.log("amountUsdc:", p.amountUsdc);
  console.log("answer:", p.answer.slice(0, 600));
} catch (err) {
  console.log("\nSANCTIONS PROBE FAILED:", err.constructor.name, "-", String(err.message).slice(0, 600));
  process.exitCode = 1;
}

const ledgerAfter = await (
  await fetch(`${NODE_URL}/v1/ledger/account/${client.account.address}`)
).json();
console.log("\nescrow after: balance", ledgerAfter.balance, "charged", ledgerAfter.charged);
console.log("client spentUsdc:", client.spentUsdc);
