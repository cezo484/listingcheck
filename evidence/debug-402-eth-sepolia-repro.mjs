// Debug script, round 2: Eth Sepolia 402 failure. Testnet only.
// Step A0: wallet balances on Eth Sepolia (USDC + ETH).
// Step A1: unpaid quote, print the FULL 402 payment-required JSON.
// Step A1b: read the token's on-chain name()/version()/decimals() and
//   DOMAIN_SEPARATOR; compare with the challenge's extra.
// Step A2: create a payment payload via the same client config as the app.
// Step A3: ecrecover the signature against the advertised domain.
// Step A4: simulate transferWithAuthorization on-chain via eth_call.
// Step B: paid request via the wrapper, exactly like the app, with a
//   logging fetch that records whether a payment header went out.
// Step C (only if B returns 402): retry the SAME payload with X-PAYMENT.
// Step D (only if B and C return 402): direct-route probe with the
//   top-ranked miner for the same intent (one call, $0.01 max).
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  getAddress,
  recoverTypedDataAddress,
  keccak256,
  encodeAbiParameters,
} from "viem";
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
import {
  paymentConfig,
  quotedAccept,
} from "/home/hatch/workspace/hackathon-builds/listingcheck/src/telegraph.js";

const ROOT = "/home/hatch/workspace/hackathon-builds/listingcheck";
for (const line of readFileSync(`${ROOT}/.env`, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined)
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const privateKey = process.env.TELEGRAPH_WALLET_PRIVATE_KEY;
const account = privateKeyToAccount(privateKey);
console.log("wallet:", account.address);

const pub = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const erc20Abi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "version", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "DOMAIN_SEPARATOR", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "authorizationState", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "n", type: "bytes32" }], outputs: [{ type: "bool" }] },
];

// --- A0: balances ---
const usdcBal = await pub.readContract({ address: getAddress(USDC_ADDRESS), abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const ethBal = await pub.getBalance({ address: account.address });
console.log("\n[A0] USDC balance:", (Number(usdcBal) / 1e6).toFixed(2), "| ETH balance:", (Number(ethBal) / 1e18).toFixed(5));

const intent = "ONCHAIN_METRIC_VERIFY_GENERAL";
const query =
  "Read the USDC balance of the contract at 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 on base at the latest block.";
const url = `${NODE_URL}/engine/v1/ask`;
const init = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ intent, query }),
};

// --- A1: unpaid quote, full 402 JSON ---
const qres = await fetch(url, init);
console.log("\n[A1] quote status:", qres.status);
const headerB64 = qres.headers.get("payment-required");
const paymentRequired = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8"));
console.log("[A1] x402Version:", paymentRequired.x402Version);
console.log("[A1] FULL payment-required JSON:");
console.log(JSON.stringify(paymentRequired, null, 2));
const accept = quotedAccept(qres, NETWORK, USDC_ADDRESS);
console.log("[A1] quotedAccept (Eth Sepolia):", accept);

// --- A1b: on-chain token identity vs the challenge's extra ---
const [onName, onVersion, onDecimals, onSep] = await Promise.all([
  pub.readContract({ address: getAddress(USDC_ADDRESS), abi: erc20Abi, functionName: "name" }),
  pub.readContract({ address: getAddress(USDC_ADDRESS), abi: erc20Abi, functionName: "version" }).catch(() => "(no version())"),
  pub.readContract({ address: getAddress(USDC_ADDRESS), abi: erc20Abi, functionName: "decimals" }),
  pub.readContract({ address: getAddress(USDC_ADDRESS), abi: erc20Abi, functionName: "DOMAIN_SEPARATOR" }),
]);
console.log("\n[A1b] on-chain name:", JSON.stringify(onName), "| version:", JSON.stringify(onVersion), "| decimals:", onDecimals);
console.log("[A1b] on-chain DOMAIN_SEPARATOR:", onSep);
const extra = paymentRequired.accepts?.find(
  (a) => a.scheme === "exact" && a.network === NETWORK,
)?.extra;
console.log("[A1b] challenge extra for Eth Sepolia accept:", JSON.stringify(extra));
// Locally recompute the EIP-712 domain separator from the advertised
// name/version and compare with the contract's own separator.
if (extra?.name && extra?.version) {
  const typeHash = keccak256(new TextEncoder().encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  const localSep = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [typeHash, keccak256(new TextEncoder().encode(extra.name)), keccak256(new TextEncoder().encode(extra.version)), BigInt(CHAIN_ID), getAddress(USDC_ADDRESS)],
    ),
  );
  console.log("[A1b] separator from advertised extra:", localSep, localSep.toLowerCase() === onSep.toLowerCase() ? "== on-chain MATCH" : "!= on-chain MISMATCH");
}

// --- A2: create payload via the same client config as the app ---
const client = x402Client.fromConfig(
  paymentConfig({ privateKey, chainId: CHAIN_ID, usdcAddress: USDC_ADDRESS, maxPricePerCallUsdc: 0.02 }),
);
let payload;
try {
  payload = await client.createPaymentPayload(paymentRequired);
} catch (e) {
  console.log("\n[A2] createPaymentPayload THREW:", String(e?.message ?? e).slice(0, 500));
  process.exit(0);
}
console.log("\n[A2] payload x402Version:", payload.x402Version);
console.log("[A2] accepted:", payload.accepted.scheme, payload.accepted.network, payload.accepted.asset, "amount", payload.accepted.amount, "payTo", payload.accepted.payTo);
console.log("[A2] authorization:", JSON.stringify(payload.payload.authorization));
console.log("[A2] signature present:", typeof payload.payload.signature === "string", "len:", payload.payload.signature?.length);

// --- A3: verify signature locally (ecrecover, advertised domain) ---
const auth = payload.payload.authorization;
const domain = {
  name: payload.accepted.extra.name,
  version: payload.accepted.extra.version,
  chainId: CHAIN_ID,
  verifyingContract: getAddress(payload.accepted.asset),
};
const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ],
};
const message = {
  from: getAddress(auth.from),
  to: getAddress(auth.to),
  value: BigInt(auth.value),
  validAfter: BigInt(auth.validAfter),
  validBefore: BigInt(auth.validBefore),
  nonce: auth.nonce,
};
const recovered = await recoverTypedDataAddress({ domain, types, primaryType: "TransferWithAuthorization", message, signature: payload.payload.signature });
console.log("\n[A3] recovered signer (advertised domain):", recovered, recovered.toLowerCase() === account.address.toLowerCase() ? "== wallet OK" : "MISMATCH!");
// Also check the nonce is still unused on-chain.
const nonceUsed = await pub.readContract({ address: getAddress(USDC_ADDRESS), abi: erc20Abi, functionName: "authorizationState", args: [account.address, auth.nonce] });
console.log("[A3] nonce already used on-chain:", nonceUsed);

// --- A4: simulate transferWithAuthorization on-chain via eth_call ---
const sig = payload.payload.signature;
const v = Number("0x" + sig.slice(-2));
const r = "0x" + sig.slice(2, 66);
const s = "0x" + sig.slice(66, 130);
const abi = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
];
const calldata = encodeFunctionData({
  abi,
  functionName: "transferWithAuthorization",
  args: [message.from, message.to, message.value, message.validAfter, message.validBefore, message.nonce, v, r, s],
});
try {
  await pub.call({ to: getAddress(USDC_ADDRESS), data: calldata });
  console.log("[A4] eth_call transferWithAuthorization: SUCCESS (contract would accept this authorization)");
} catch (e) {
  console.log("[A4] eth_call transferWithAuthorization: REVERTED:", String(e.message ?? e).slice(0, 400));
}

// --- B: paid request via the wrapper, exactly like the app ---
const requestLog = [];
const loggingFetch = async (u, i) => {
  const headers = new Headers(i?.headers);
  requestLog.push({
    url: String(u),
    hasPaymentSignature: headers.has("PAYMENT-SIGNATURE"),
    paymentSignatureLen: headers.get("PAYMENT-SIGNATURE")?.length ?? 0,
    hasXPayment: headers.has("X-PAYMENT"),
    hasPayment: headers.has("PAYMENT"),
  });
  return fetch(u, i);
};
const paymentFetch = wrapFetchWithPaymentFromConfig(
  loggingFetch,
  paymentConfig({ privateKey, chainId: CHAIN_ID, usdcAddress: USDC_ADDRESS, maxPricePerCallUsdc: 0.02 }),
);
const bres = await paymentFetch(url, init);
console.log("\n[B] wrapper paid-request status:", bres.status);
console.log("[B] requests the wrapper made:", JSON.stringify(requestLog, null, 2));
console.log("[B] response headers:");
for (const [k, val] of bres.headers.entries()) console.log("   ", k, "=", val.slice(0, 200));
const btext = await bres.text();
console.log("[B] FULL body:", btext);

// --- C: only if B was a 402, retry SAME payload with X-PAYMENT ---
if (bres.status === 402) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  console.log("\n[C] retrying same payload with X-PAYMENT header...");
  const cres = await fetch(url, { ...init, headers: { ...init.headers, "X-PAYMENT": b64 } });
  console.log("[C] X-PAYMENT retry status:", cres.status);
  for (const [k, val] of cres.headers.entries()) console.log("   ", k, "=", val.slice(0, 200));
  const ctext = await cres.text();
  console.log("[C] FULL body:", ctext);

  // --- D: direct route probe, top-ranked miner for the same intent ---
  console.log("\n[D] engine route failed twice; probing the direct route...");
  const mres = await fetch(`${NODE_URL}/api/miners?intent=${encodeURIComponent(intent)}&status=active&limit=100`);
  const mbody = await mres.json();
  const miners = Array.isArray(mbody) ? mbody : (mbody.miners ?? []);
  console.log("[D] miners listed:", miners.length);
  const { rankMiners } = await import("/home/hatch/workspace/hackathon-builds/listingcheck/src/telegraph.js");
  const ranked = rankMiners(intent, miners);
  console.log("[D] ranked miners:", ranked.slice(0, 3).map((m) => `#${m.rank} ${m.id} (${m.name}) ${m.method} ${m.path}`).join(" | ") || "none");
  if (ranked.length > 0) {
    const miner = ranked[0];
    const durl = `${NODE_URL}/engine/v1/ask/${encodeURIComponent(miner.id)}`;
    const dinit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: miner.method, endpoint: miner.path, payload: { query } }),
    };
    const dq = await fetch(durl, dinit);
    console.log("[D] direct unpaid quote status:", dq.status);
    const daccept = quotedAccept(dq, NETWORK, USDC_ADDRESS);
    console.log("[D] direct quotedAccept:", daccept);
    if (dq.status === 402 && daccept) {
      const dlog = [];
      const dLoggingFetch = async (u, i) => {
        const h = new Headers(i?.headers);
        dlog.push({ hasPaymentSignature: h.has("PAYMENT-SIGNATURE"), len: h.get("PAYMENT-SIGNATURE")?.length ?? 0 });
        return fetch(u, i);
      };
      const dpay = wrapFetchWithPaymentFromConfig(
        dLoggingFetch,
        paymentConfig({ privateKey, chainId: CHAIN_ID, usdcAddress: USDC_ADDRESS, maxPricePerCallUsdc: 0.02 }),
      );
      const dres = await dpay(durl, dinit);
      console.log("[D] direct paid-request status:", dres.status, "| requests:", JSON.stringify(dlog));
      for (const [k, val] of dres.headers.entries()) console.log("   ", k, "=", val.slice(0, 200));
      console.log("[D] FULL body:", (await dres.text()).slice(0, 2000));
    }
  }
}
console.log("\nDone.");
