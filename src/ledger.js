// Spend ledger: one JSON record per paid request, written next to the
// memo. The record carries everything needed to re-check the payment
// without trusting the app: the chain, the USDC contract, the payment
// transaction, the Telegraph receipt hash, and the signal hash.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ledgerEntry(purchase, check) {
  return {
    at: new Date().toISOString(),
    check: check.key,
    intent: check.intent,
    query: check.query,
    route: purchase.route,
    paymentRail: purchase.paymentRail,
    minerId: purchase.minerId,
    minerName: purchase.minerName,
    minerRank: purchase.minerRank,
    minerScore: purchase.minerScore,
    amountUsdc: purchase.amountUsdc,
    network: purchase.network,
    chainId: purchase.chainId,
    usdcContract: purchase.usdcContract,
    txHash: purchase.txHash,
    txUrl: purchase.txUrl,
    receiptHash: purchase.receiptHash,
    signalHash: purchase.signalHash,
    latencyMs: purchase.latencyMs,
  };
}

export function writeRun(dir, memo, entries) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "memo.json"),
    JSON.stringify(memo, null, 2) + "\n",
  );
  writeFileSync(join(dir, "ledger.json"), JSON.stringify(entries, null, 2) + "\n");
  return dir;
}
