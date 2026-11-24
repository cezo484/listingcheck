// Debug script for the ListingCheck 402 failure. Testnet only.
// Step A: quote + create payload + verify signature locally + simulate
// transferWithAuthorization via eth_call (no payment, no cost).
// Step B: send the paid request exactly like the app does (wrapper).
// Step C (only if B returns 402): retry the SAME payload with the
// X-PAYMENT header instead of PAYMENT-SIGNATURE.
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, http, encodeFunctionData, getAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import { x402Client } from "@x402/fetch";
import { NODE_URL, NETWORK, USDC_ADDRESS, CHAIN_ID } from "/home/hatch/workspace/hackathon-builds/listingcheck/src/config.js";
import { paymentConfig, quotedAccept } from "/home/hatch/workspace/hackathon-builds/listingcheck/src/telegraph.js";

const ROOT = "/home/hatch/workspace/hackathon-builds/listingcheck";
for (const line of readFileSync(`${ROOT}/.env`, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const privateKey = process.env.TELEGRAPH_WALLET_PRIVATE_KEY;
const account = privateKeyToAccount(privateKey);
console.log("wallet:", account.address);

const intent = "ONCHAIN_METRIC_VERIFY_GENERAL";
const query = "Read the USDC balance of the contract at 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 on base at the latest block.";
const url = `${NODE_URL}/engine/v1/ask`;
const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent, query }) };

// --- Step A1: unpaid quote ---
const qres = await fetch(url, init);
console.log("\n[A1] quote status:", qres.status);
const headerB64 = qres.headers.get("payment-required");
const paymentRequired = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8"));
console.log("[A1] x402Version:", paymentRequired.x402Version);
console.log("[A1] accepts:", paymentRequired.accepts.map((a) => `${a.scheme} ${a.network} ${a.asset ?? "-"} amount=${a.amount ?? "-"}`).join(" | "));
const accept = quotedAccept(qres, NETWORK, USDC_ADDRESS);
console.log("[A1] quotedAccept (Base Sepolia):", accept);

// --- Step A2: create payload via the same client config as the app ---
const client = x402Client.fromConfig(paymentConfig({ privateKey, chainId: CHAIN_ID, usdcAddress: USDC_ADDRESS, maxPricePerCallUsdc: 0.02 }));
const payload = await client.createPaymentPayload(paymentRequired);
console.log("\n[A2] payload x402Version:", payload.x402Version);
console.log("[A2] accepted:", payload.accepted.scheme, payload.accepted.network, payload.accepted.asset, "amount", payload.accepted.amount, "payTo", payload.accepted.payTo);
console.log("[A2] authorization:", JSON.stringify(payload.payload.authorization));

// --- Step A3: verify signature locally (ecrecover) ---
const auth = payload.payload.authorization;
const domain = { name: payload.accepted.extra.name, version: payload.accepted.extra.version, chainId: CHAIN_ID, verifyingContract: getAddress(payload.accepted.asset) };
const types = { TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] };
const message = { from: getAddress(auth.from), to: getAddress(auth.to), value: BigInt(auth.value), validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), nonce: auth.nonce };
const recovered = await recoverTypedDataAddress({ domain, types, primaryType: "TransferWithAuthorization", message, signature: payload.payload.signature });
console.log("\n[A3] recovered signer:", recovered, recovered.toLowerCase() === account.address.toLowerCase() ? "== wallet OK" : "MISMATCH!");

// --- Step A4: simulate transferWithAuthorization on-chain via eth_call ---
const sig = payload.payload.signature;
const v = Number("0x" + sig.slice(-2));
const r = "0x" + sig.slice(2, 66);
const s = "0x" + sig.slice(66, 130);
const abi = [{ name: "transferWithAuthorization", type: "function", stateMutability: "nonpayable", inputs: [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" } ], outputs: [] }];
const calldata = encodeFunctionData({ abi, functionName: "transferWithAuthorization", args: [message.from, message.to, message.value, message.validAfter, message.validBefore, message.nonce, v, r, s] });
const pub = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
try {
  await pub.call({ to: getAddress(USDC_ADDRESS), data: calldata });
  console.log("[A4] eth_call transferWithAuthorization: SUCCESS (contract would accept this authorization)");
} catch (e) {
  console.log("[A4] eth_call transferWithAuthorization: REVERTED:", String(e.message ?? e).slice(0, 300));
}

// --- Step B: paid request via the wrapper, exactly like the app ---
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
const paymentFetch = wrapFetchWithPaymentFromConfig(fetch, paymentConfig({ privateKey, chainId: CHAIN_ID, usdcAddress: USDC_ADDRESS, maxPricePerCallUsdc: 0.02 }));
const bres = await paymentFetch(url, init);
console.log("\n[B] wrapper paid-request status:", bres.status);
console.log("[B] response headers payment-response:", bres.headers.get("payment-response"));
console.log("[B] response headers x-payment-response:", bres.headers.get("x-payment-response"));
console.log("[B] response headers x-telegraph-receipt:", bres.headers.get("x-telegraph-receipt"));
const btext = await bres.text();
console.log("[B] body (first 600 chars):", btext.slice(0, 600));

// --- Step C: only if B was a 402, retry SAME payload with X-PAYMENT ---
if (bres.status === 402) {
  const { x402HTTPClient } = await import("@x402/fetch");
  const httpClient = new x402HTTPClient(client);
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  console.log("\n[C] retrying same payload with X-PAYMENT header...");
  const cres = await fetch(url, { ...init, headers: { ...init.headers, "X-PAYMENT": b64 } });
  console.log("[C] X-PAYMENT retry status:", cres.status);
  console.log("[C] x-payment-response:", cres.headers.get("x-payment-response"));
  console.log("[C] payment-response:", cres.headers.get("payment-response"));
  const ctext = await cres.text();
  console.log("[C] body (first 600 chars):", ctext.slice(0, 600));
}
console.log("\nDone.");
