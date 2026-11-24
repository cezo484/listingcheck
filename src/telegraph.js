// Client for the Telegraph devnode. Every paid request starts with an
// unpaid request that returns a 402 challenge with the live price; the
// client checks that price against its caps, then pays and retries.
//
// Two payment rails exist. Escrow is tried first: the client signs an
// EIP-191 personal_sign of the challenge's escrow message (it proves
// intent only and cannot move funds) and sends it in the X-PAYMENT
// header; the node charges the caller's pre-funded Telegraph escrow
// balance in its ledger. The escrow balance is funded once on chain
// (scripts/deposit-escrow.mjs). Escrow is the default because the
// devnode's exact-scheme (x402 EIP-3009) verification is broken
// server-side on both Sepolia networks as of 19 Nov 2026: valid signed
// payments are rejected with a bare 402 (see
// evidence/debug-2026-11-19-eth-sepolia-402.md). The exact path is kept
// as a fallback: if the 402 offers no escrow option, or escrow refuses
// the ask with a 402, the client pays via x402 exactly as before.
//
// Two routes exist. Engine routing (POST /engine/v1/ask with a canonical
// intent id and a free-form query) lets Telegraph pick the miner; that is
// the mission story and the default. The direct route
// (POST /engine/v1/ask/{minerId}) pays a miner the caller picked from the
// leaderboard; it is used only when the caller asks for it, and the memo
// says so. A delivered answer is never retried for quality: retrying
// would charge again.

import { randomBytes } from "node:crypto";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAIN_ID,
  EXPLORER,
  NETWORK,
  NODE_URL,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "./config.js";

export class PriceGuardError extends Error {}
export class BudgetCapError extends Error {}
export class AskFailedError extends Error {}
// The paid request went out but its outcome is unclear; never retry
// automatically, because the payment may have settled.
export class PaymentUnknownError extends Error {}

const MAX_MINERS_TRIED = 3;

function decodeB64Json(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// The 402 challenge lists several payment options (exact on Sepolia,
// exact on Base Sepolia, exact on Solana, escrow). We only pay the one
// this client is configured for: exact, our network, our USDC.
export function quotedAccept(res, network = NETWORK, asset = USDC_ADDRESS) {
  const parsed = decodeB64Json(res.headers.get("payment-required"));
  if (!Array.isArray(parsed?.accepts)) return null;
  const match = parsed.accepts.find(
    (a) =>
      a?.scheme === "exact" &&
      a.network === network &&
      typeof a.asset === "string" &&
      a.asset.toLowerCase() === asset.toLowerCase(),
  );
  if (!match || typeof match.amount !== "string") return null;
  return {
    amount: match.amount,
    network: match.network,
    asset: match.asset,
    payTo: match.payTo,
  };
}

// The escrow option from the same 402 challenge. It carries no asset:
// the escrow balance is USDC deposited on chain once, and the node
// charges it in its ledger. The message template in extra.message is
// what the client signs; without it the option is unusable.
export function escrowAccept(res, network = NETWORK) {
  const parsed = decodeB64Json(res.headers.get("payment-required"));
  if (!Array.isArray(parsed?.accepts)) return null;
  const match = parsed.accepts.find(
    (a) =>
      a?.scheme === "escrow" &&
      a.network === network &&
      typeof a?.extra?.message === "string" &&
      a.extra.message.length > 0,
  );
  if (!match || typeof match.amount !== "string") return null;
  return {
    amount: match.amount,
    network: match.network,
    payTo: match.payTo,
    message: match.extra.message,
  };
}

// Fill the escrow message template. The node rebuilds the message with
// the wallet lowercased, so the signed text must match exactly.
export function escrowMessage(template, authorization) {
  return template
    .replaceAll("{from}", authorization.from.toLowerCase())
    .replaceAll("{nonce}", authorization.nonce)
    .replaceAll("{validAfter}", authorization.validAfter)
    .replaceAll("{validBefore}", authorization.validBefore);
}

// Build the base64 X-PAYMENT envelope for an escrow accept, following
// telegraph-mcp's src/pay.ts: substitute the wallet (lowercase), a
// random nonce and a 70-second window (10s back, 60s forward; the node
// allows a window of 2 minutes at most) into the challenge message,
// personal_sign it (EIP-191), and wrap it as
// {x402Version: 2, scheme: "escrow", network, payload: {signature,
// authorization}}. The signature proves intent only; it cannot move
// funds, and the node charges the pre-funded escrow balance.
export async function escrowPaymentHeader(
  account,
  accept,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const authorization = {
    from: account.address,
    to: accept.payTo,
    value: accept.amount,
    validAfter: String(nowSeconds - 10),
    validBefore: String(nowSeconds + 60),
    nonce: "0x" + randomBytes(32).toString("hex"),
  };
  const message = escrowMessage(accept.message, authorization);
  const signature = await account.signMessage({ message });
  const envelope = {
    x402Version: 2,
    scheme: "escrow",
    network: accept.network,
    payload: { signature, authorization },
  };
  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

function settleHeader(res) {
  return decodeB64Json(
    res.headers.get("payment-response") ||
      res.headers.get("x-payment-response"),
  );
}

// The escrow receipt header. Unlike the x402 settlement proof it
// carries no on-chain transaction: the node bills the escrow balance
// in its ledger, so the receipt only names what was billed.
function escrowReceiptHeader(res) {
  return decodeB64Json(res.headers.get("x-payment-response"));
}

function receiptHeader(res) {
  return decodeB64Json(res.headers.get("x-telegraph-receipt"));
}

export function answerText(result) {
  if (typeof result === "string") return result;
  const a = result?.answer;
  return typeof a === "string" ? a : JSON.stringify(result);
}

// The testnet USDC is not one of @x402's built-in assets, so it must be
// allow-listed or the client refuses to sign. The per-payment cap
// re-checks the max price inside the signer, covering a price change
// between the quote request and the paid one.
export function paymentConfig({ privateKey, chainId, usdcAddress, maxPricePerCallUsdc }) {
  const network = `eip155:${chainId}`;
  return {
    schemes: [
      {
        network,
        client: new ExactEvmScheme(
          toClientEvmSigner(privateKeyToAccount(privateKey)),
        ),
      },
    ],
    spendControls: {
      allowedAssets: [
        {
          network,
          asset: usdcAddress,
          maxAmountPerPayment: String(
            Math.round(maxPricePerCallUsdc * USDC_DECIMALS),
          ),
        },
      ],
    },
  };
}

export function rankMiners(intent, miners) {
  const ranked = [];
  for (const m of miners) {
    const s = m.scores?.find((x) => x.intent_id === intent);
    const eps = m.endpoints ?? [];
    const ep =
      eps.find((e) => (e.description ?? "").includes(intent)) ??
      (eps.length === 1 ? eps[0] : undefined);
    if (!s || typeof s.rank !== "number" || !ep?.path || m.id === undefined) {
      continue;
    }
    ranked.push({
      id: String(m.id),
      name: m.name ?? String(m.id),
      method: ep.method ?? "GET",
      path: ep.path,
      rank: s.rank,
      score: s.score ?? null,
    });
  }
  return ranked.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
}

export class TelegraphClient {
  spentUsdc = 0;

  constructor({
    nodeUrl = NODE_URL,
    privateKey,
    chainId = CHAIN_ID,
    usdcAddress = USDC_ADDRESS,
    maxPricePerCallUsdc,
    budgetCapUsdc,
    fetchImpl = fetch,
    paymentFetch = null,
  }) {
    if (!privateKey) {
      throw new Error(
        "TELEGRAPH_WALLET_PRIVATE_KEY is not set. Put the testnet wallet key in .env; never commit it.",
      );
    }
    this.nodeUrl = nodeUrl.replace(/\/$/, "");
    this.network = `eip155:${chainId}`;
    this.chainId = chainId;
    this.usdcAddress = usdcAddress;
    this.maxPricePerCallUsdc = maxPricePerCallUsdc;
    this.budgetCapUsdc = budgetCapUsdc;
    this.fetchImpl = fetchImpl;
    // The escrow path signs with this account (personal_sign); the
    // exact path signs through the x402 client config below.
    this.account = privateKeyToAccount(privateKey);
    this.paymentFetch =
      paymentFetch ??
      wrapFetchWithPaymentFromConfig(
        fetchImpl,
        paymentConfig({ privateKey, chainId, usdcAddress, maxPricePerCallUsdc }),
      );
  }

  async getIntent(intentId) {
    const res = await this.fetchImpl(
      `${this.nodeUrl}/engine/v1/intents/${encodeURIComponent(intentId)}`,
    );
    if (!res.ok) {
      throw new AskFailedError(
        `${intentId}: intent lookup HTTP ${res.status}`,
      );
    }
    return res.json();
  }

  async rankedMiners(intent) {
    const res = await this.fetchImpl(
      `${this.nodeUrl}/api/miners?intent=${encodeURIComponent(intent)}&status=active&limit=100`,
    );
    if (!res.ok) {
      throw new AskFailedError(`${intent}: miner list HTTP ${res.status}`);
    }
    const body = await res.json();
    const miners = Array.isArray(body) ? body : (body.miners ?? []);
    return rankMiners(intent, miners);
  }

  // Unpaid request: returns the live 402 quote without signing anything.
  // Throws when the node does not answer with a 402. The price is read
  // from the escrow option when the node offers it (the rail pay()
  // uses first), otherwise from the exact option.
  async quote(intent, query) {
    const res = await this.fetchImpl(`${this.nodeUrl}/engine/v1/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, query }),
    });
    if (res.status !== 402) {
      const text = await res.text().catch(() => "");
      throw new AskFailedError(
        `expected a 402 quote, got HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
    const escrow = escrowAccept(res, this.network);
    const exact = escrow
      ? null
      : quotedAccept(res, this.network, this.usdcAddress);
    const accept = escrow ?? exact;
    if (!accept) {
      throw new AskFailedError(
        `402 offers no escrow or exact payment on ${this.network}`,
      );
    }
    return {
      intent,
      scheme: escrow ? "escrow" : "exact",
      amountUsdc: Number(accept.amount) / USDC_DECIMALS,
      amountAtomic: accept.amount,
      network: accept.network,
      asset: exact?.asset ?? null,
      payTo: accept.payTo,
    };
  }

  // Engine routing: Telegraph picks the miner. The response names the
  // miner that served the request, so the memo records it.
  async buyRouted(intent, query) {
    const url = `${this.nodeUrl}/engine/v1/ask`;
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, query }),
    };
    return this.pay(url, init, intent, null);
  }

  // Direct route: pay a miner picked from the leaderboard. Tries up to
  // three ranked miners, stepping down only on a failed call. A delivered
  // answer, even a weak one, is not retried.
  async buyDirect(intent, query) {
    const miners = (await this.rankedMiners(intent)).slice(0, MAX_MINERS_TRIED);
    const failures = [];
    for (const miner of miners) {
      const url = `${this.nodeUrl}/engine/v1/ask/${encodeURIComponent(miner.id)}`;
      const init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: miner.method,
          endpoint: miner.path,
          payload: { query },
        }),
      };
      try {
        return await this.pay(url, init, intent, miner);
      } catch (err) {
        if (!(err instanceof AskFailedError)) throw err;
        failures.push(`#${miner.rank ?? "unranked"} ${miner.id}: ${err.message}`);
      }
    }
    throw new AskFailedError(
      `${intent}: no ranked miner answered, ${failures.join(" | ") || "none ranked"}`,
    );
  }

  // Shared paid-request flow: quote, guard, pay, verify the result.
  // Escrow is tried first; a 402 refusal falls back to the exact
  // (x402) path, like telegraph-mcp's auto mode. Any other failure is
  // final: a failed ask is never billed on escrow, and a network error
  // after signing leaves the outcome unknown, so neither is retried.
  async pay(url, init, intent, miner) {
    const started = Date.now();
    const quoteRes = await this.fetchImpl(url, init);
    if (quoteRes.status !== 402) {
      throw new AskFailedError(
        `expected a 402 quote, got HTTP ${quoteRes.status}`,
      );
    }
    const escrow = escrowAccept(quoteRes, this.network);
    const exact = quotedAccept(quoteRes, this.network, this.usdcAddress);
    const accept = escrow ?? exact;
    if (!accept) {
      throw new AskFailedError(
        `402 offers no escrow or exact payment on ${this.network}`,
      );
    }
    const amountUsdc = Number(accept.amount) / USDC_DECIMALS;
    if (amountUsdc > this.maxPricePerCallUsdc) {
      throw new PriceGuardError(
        `quote ${amountUsdc} USDC exceeds the per-call cap ${this.maxPricePerCallUsdc} (${intent})`,
      );
    }
    // The signer may settle anything up to the per-call cap (a repriced
    // call), so reserve that worst case against the budget, not the quote.
    const worstCaseUsdc = Math.max(amountUsdc, this.maxPricePerCallUsdc);
    if (this.spentUsdc + worstCaseUsdc > this.budgetCapUsdc) {
      throw new BudgetCapError(
        `spent ${this.spentUsdc} + worst-case ${worstCaseUsdc} USDC (quote ${amountUsdc}) exceeds the budget cap ${this.budgetCapUsdc}`,
      );
    }

    if (escrow) {
      const res = await this.payViaEscrow(url, init, escrow, intent);
      if (res.status !== 402) {
        return this.finishPaid(res, {
          rail: "escrow",
          amountUsdc,
          accept,
          intent,
          miner,
          started,
        });
      }
      // Escrow refused (empty balance, or the node turned it off for
      // this ask): nothing was billed, so the exact path may try.
      if (!exact) {
        const reason = `HTTP 402 ${(await res.text().catch(() => "")).slice(0, 300)}`.trim();
        throw new AskFailedError(reason);
      }
    }

    let res;
    try {
      res = await this.paymentFetch(url, init);
    } catch (err) {
      throw new PaymentUnknownError(
        `${intent}: no response after payment attempt: ${String(err).slice(0, 300)}`,
      );
    }
    if (!res.ok) {
      const reason = `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`.trim();
      throw new AskFailedError(reason);
    }
    return this.finishPaid(res, {
      rail: "exact",
      amountUsdc,
      accept: exact,
      intent,
      miner,
      started,
    });
  }

  // One escrow attempt: sign the challenge message and resend with the
  // X-PAYMENT header. Returns the raw response; the caller decides
  // whether a 402 means falling back to exact. A thrown fetch means
  // the outcome is unknown, so it is never retried or fallen back from.
  async payViaEscrow(url, init, escrow, intent) {
    const header = await escrowPaymentHeader(this.account, escrow);
    const paidInit = {
      ...init,
      headers: { ...init.headers, "X-PAYMENT": header },
    };
    try {
      return await this.fetchImpl(url, paidInit);
    } catch (err) {
      throw new PaymentUnknownError(
        `${intent}: no response after escrow payment attempt: ${String(err).slice(0, 300)}`,
      );
    }
  }

  // Read a delivered answer into a purchase record. The rails differ
  // in what proves payment: exact settles on chain before the miner
  // runs, so the settlement header must name a transaction; escrow
  // bills only a delivered ask in the node's ledger, so a 2xx answer
  // is itself the proof and the receipt only names what was billed.
  async finishPaid(res, { rail, amountUsdc, accept, intent, miner, started }) {
    if (!res.ok) {
      const reason = `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`.trim();
      throw new AskFailedError(reason);
    }
    let txHash = "";
    let txUrl = "";
    if (rail === "exact") {
      const settle = settleHeader(res);
      if (settle?.success === false) {
        throw new AskFailedError("settlement reported success: false");
      }
      if (settle?.success !== true || typeof settle.transaction !== "string") {
        throw new PaymentUnknownError(
          `${intent}: answered without a readable settlement proof`,
        );
      }
      txHash = settle.transaction;
      txUrl = `${EXPLORER}/tx/${settle.transaction}`;
    }
    // The settled amount can differ from the quote; the receipt carries
    // what was actually charged, so the record uses it.
    const receipt = receiptHeader(res);
    const escrowReceipt = rail === "escrow" ? escrowReceiptHeader(res) : null;
    const rawSettled = receipt?.amount_uusdc ?? escrowReceipt?.amount_uusdc;
    const settledAtomic =
      typeof rawSettled === "number"
        ? rawSettled
        : typeof rawSettled === "string" && rawSettled !== ""
          ? Number(rawSettled)
          : NaN;
    const settledUsdc = Number.isFinite(settledAtomic)
      ? settledAtomic / USDC_DECIMALS
      : amountUsdc;
    this.spentUsdc += settledUsdc;

    const body = await res.json().catch(() => ({}));
    return {
      intent,
      route: miner ? "direct" : "engine",
      paymentRail: rail,
      minerId: String(body.miner_id ?? miner?.id ?? ""),
      minerName: body.miner_name ?? miner?.name ?? "",
      minerRank: miner?.rank ?? null,
      minerScore: miner?.score ?? null,
      amountUsdc: settledUsdc,
      txHash,
      txUrl,
      receiptHash: receipt?.receipt_hash ?? "",
      signalHash: body.signal_hash ?? "",
      answer: answerText(body.result),
      result: body.result,
      latencyMs: Date.now() - started,
      network: accept.network,
      chainId: Number(accept.network.split(":")[1]),
      usdcContract: accept.asset ?? this.usdcAddress,
    };
  }
}

export { EXPLORER };
