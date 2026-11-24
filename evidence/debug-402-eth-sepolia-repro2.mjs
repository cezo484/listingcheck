// Decisive test, round 2b: is the wrapper actually sending the payment
// header, and does the devnode reject a manually-sent valid payload?
// E1: wrapper with FIXED logging (reads headers off the Request object).
// E2: manual fetch with PAYMENT-SIGNATURE header, bypassing the wrapper.
// E3: manual fetch with BOTH PAYMENT-SIGNATURE and X-PAYMENT headers.
// E4: probe the devnode for a public facilitator endpoint (read-only).
import { readFileSync } from "node:fs";
import { createPublicClient, http, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import {
  NODE_URL,
  NETWORK,
  USDC_ADDRESS,
  CHAIN_ID,
  SEPOLIA_RPC,
} from "/home/hatch/workspace/hackathon-builds/listingcheck/src/config.js";
import { paymentConfig } from "/home/hatch/workspace/hackathon-builds/listingcheck/src/telegraph.js";

const ROOT = "/home/hatch/workspace/hackathon-builds/listingcheck";
for (const line of readFileSync(`${ROOT}/.env`, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined)
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const privateKey = process.env.TELEGRAPH_WALLET_PRIVATE_KEY;
const account = privateKeyToAccount(privateKey);

const intent = "ONCHAIN_METRIC_VERIFY_GENERAL";
const query =
  "Read the USDC balance of the contract at 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 on base at the latest block.";
const url = `${NODE_URL}/engine/v1/ask`;
const init = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ intent, query }),
};

// Fresh quote + fresh payload (new nonce each run).
const qres = await fetch(url, init);
const paymentRequired = JSON.parse(
  Buffer.from(qres.headers.get("payment-required"), "base64").toString("utf8"),
);
const client = x402Client.fromConfig(
  paymentConfig({ privateKey, chainId: CHAIN_ID, usdcAddress: USDC_ADDRESS, maxPricePerCallUsdc: 0.02 }),
);
const payload = await client.createPaymentPayload(paymentRequired);
console.log("payload for:", payload.accepted.network, payload.accepted.asset, "amount", payload.accepted.amount);
const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");

// --- E1: wrapper with fixed logging ---
const requestLog = [];
const loggingFetch = async (input, i) => {
  const req = input instanceof Request ? input : new Request(input, i);
  requestLog.push({
    url: req.url,
    method: req.method,
    hasPaymentSignature: req.headers.has("PAYMENT-SIGNATURE"),
    paymentSignatureLen: req.headers.get("PAYMENT-SIGNATURE")?.length ?? 0,
    hasXPayment: req.headers.has("X-PAYMENT"),
  });
  return fetch(req);
};
const paymentFetch = wrapFetchWithPaymentFromConfig(
  loggingFetch,
  paymentConfig({ privateKey, chainId: CHAIN_ID, usdcAddress: USDC_ADDRESS, maxPricePerCallUsdc: 0.02 }),
);
const e1 = await paymentFetch(url, init);
console.log("\n[E1] wrapper status:", e1.status);
console.log("[E1] requests made:", JSON.stringify(requestLog, null, 2));
await e1.text();

// --- E2: manual PAYMENT-SIGNATURE, bypassing the wrapper ---
const e2 = await fetch(url, {
  ...init,
  headers: { ...init.headers, "PAYMENT-SIGNATURE": b64 },
});
console.log("\n[E2] manual PAYMENT-SIGNATURE status:", e2.status);
for (const [k, v] of e2.headers.entries()) {
  if (k.includes("payment") || k.includes("receipt") || k.includes("telegraph")) console.log("   ", k, "=", v.slice(0, 200));
}
console.log("[E2] body (first 400):", (await e2.text()).slice(0, 400));

// --- E3: manual with BOTH headers ---
const e3 = await fetch(url, {
  ...init,
  headers: { ...init.headers, "PAYMENT-SIGNATURE": b64, "X-PAYMENT": b64 },
});
console.log("\n[E3] both headers status:", e3.status);
console.log("[E3] body (first 400):", (await e3.text()).slice(0, 400));

// --- E4: probe for a public facilitator endpoint (read-only) ---
for (const path of ["/facilitator/supported", "/api/facilitator/supported", "/facilitator/verify"]) {
  try {
    const r = await fetch(`${NODE_URL}${path}`, { method: "GET" });
    console.log(`\n[E4] GET ${path}: ${r.status}`, (await r.text()).slice(0, 300));
  } catch (e) {
    console.log(`\n[E4] GET ${path}: error`, String(e).slice(0, 150));
  }
}
// Try the standard facilitator /verify POST with our payload (read-only,
// no settlement). If the devnode exposes it, the invalidReason names the
// exact failure.
try {
  const vres = await fetch(`${NODE_URL}/facilitator/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x402Version: 2,
      paymentPayload: payload,
      paymentRequirements: paymentRequired.accepts.find(
        (a) => a.scheme === "exact" && a.network === NETWORK,
      ),
    }),
  });
  console.log("\n[E4] POST /facilitator/verify:", vres.status, (await vres.text()).slice(0, 600));
} catch (e) {
  console.log("\n[E4] POST /facilitator/verify: error", String(e).slice(0, 150));
}

// --- E5: is the known Eth Sepolia facilitator wallet funded for gas? ---
const pub = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const facEth = await pub.getBalance({ address: "0x97d38aa5de015245dcca76305b53abe6da25f6a5" });
console.log("\n[E5] facilitator 0x97d38aa5... Sepolia ETH:", (Number(facEth) / 1e18).toFixed(5));
console.log("\nDone.");
