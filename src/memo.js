// Turns the purchased findings into a listing risk memo. The verdict is
// a deterministic rule over the check outcomes, and every line of it
// names the evidence behind it. The memo is not a listing decision: it is
// the evidence pack a human reviewer starts from.

import { createHash } from "node:crypto";

// Verdict rules, in order. A sanctions flag or a critical audit finding
// blocks. Anything cautionary or unreadable goes to human review. Only a
// memo where every check came back clear recommends listing, and even
// then the memo says a human still signs off.
export function decide(findings) {
  const byKey = Object.fromEntries(findings.map((f) => [f.key, f]));
  const reasons = [];

  if (byKey.sanctions?.outcome === "flag") {
    reasons.push("Sanctions screen reported a list match.");
  }
  if (byKey.audit?.outcome === "flag") {
    reasons.push("Contract audit reported a critical or high severity finding.");
  }
  if (byKey.wash?.outcome === "flag") {
    reasons.push("Wash trading check reported half or more of volume as artificial.");
  }
  if (byKey.social?.outcome === "flag") {
    reasons.push("Social check reported the account as a bot or coordinated.");
  }
  if (reasons.length > 0) {
    return { verdict: "DO NOT LIST", reasons };
  }

  for (const f of findings) {
    if (f.outcome === "failed") {
      reasons.push(`${f.label} check failed to run, so the memo is incomplete.`);
    } else if (f.outcome === "inconclusive") {
      reasons.push(`${f.label} check returned an answer that could not be read as a clear result.`);
    } else if (f.outcome === "caution") {
      reasons.push(`${f.label} check returned a cautionary result: ${f.summary}`);
    }
  }
  if (reasons.length > 0) {
    return { verdict: "REVIEW", reasons };
  }
  return {
    verdict: "LIST",
    reasons: ["Every check came back clear. A human reviewer still signs off before any listing."],
  };
}

export function totalCostUsdc(findings) {
  return findings.reduce((sum, f) => sum + (f.amountUsdc ?? 0), 0);
}

export function memoHash(memo) {
  const body = JSON.stringify({
    token: memo.token,
    chain: memo.chain,
    claim: memo.claim,
    verdict: memo.verdict,
    findings: memo.findings.map((f) => ({
      key: f.key,
      outcome: f.outcome,
      minerId: f.minerId,
      receiptHash: f.receiptHash,
      signalHash: f.signalHash,
      txHash: f.txHash,
      amountUsdc: f.amountUsdc,
    })),
    totalCostUsdc: memo.totalCostUsdc,
  });
  return createHash("sha256").update(body).digest("hex");
}

export function buildMemo({ input, findings, startedAt, finishedAt, wallet }) {
  const { verdict, reasons } = decide(findings);
  const memo = {
    app: "ListingCheck",
    mission: "Mission 01 Exchange, Telegraph Hackathon Season II",
    network: "testnet",
    token: input.token,
    chain: input.chain,
    social: input.social,
    claim: input.claim,
    startedAt,
    finishedAt,
    wallet,
    verdict,
    verdictReasons: reasons,
    findings,
    totalCostUsdc: totalCostUsdc(findings),
    requests: findings.length,
  };
  memo.verificationHash = memoHash(memo);
  return memo;
}

function outcomeWord(outcome) {
  switch (outcome) {
    case "clear":
      return "clear";
    case "flag":
      return "FLAG";
    case "caution":
      return "caution";
    case "inconclusive":
      return "inconclusive";
    case "failed":
      return "FAILED";
    default:
      return outcome;
  }
}

export function renderMarkdown(memo) {
  const lines = [];
  lines.push("# Listing risk memo");
  lines.push("");
  lines.push(`Token: \`${memo.token}\` on ${memo.chain}`);
  if (memo.social) lines.push(`Social: ${memo.social}`);
  if (memo.claim) lines.push(`Claim checked: ${memo.claim}`);
  lines.push(`Run: ${memo.startedAt} to ${memo.finishedAt} (UTC)`);
  lines.push(`Network: testnet (Ethereum Sepolia payments, Telegraph devnode)`);
  lines.push("");
  lines.push(`## Verdict: ${memo.verdict}`);
  lines.push("");
  for (const r of memo.verdictReasons) lines.push(`- ${r}`);
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  for (const f of memo.findings) {
    lines.push(`### ${f.label}: ${outcomeWord(f.outcome)}`);
    lines.push("");
    lines.push(`Intent: \`${f.intent}\``);
    lines.push(`Miner: ${f.minerName || "unknown"} (id ${f.minerId || "unknown"}${f.minerRank ? `, rank #${f.minerRank}` : ""}, route ${f.route || "unknown"})`);
    lines.push(`Cost: $${f.amountUsdc.toFixed(2)} USDC (testnet)`);
    if (f.txHash) lines.push(`Payment: ${f.txUrl}`);
    else if (f.paymentRail === "escrow") {
      lines.push(`Payment: Telegraph escrow (charged to the escrow balance)`);
    }
    if (f.receiptHash) lines.push(`Receipt hash: ${f.receiptHash}`);
    if (f.signalHash) lines.push(`Signal hash: ${f.signalHash}`);
    if (f.latencyMs !== null && f.latencyMs !== undefined) {
      lines.push(`Latency: ${(f.latencyMs / 1000).toFixed(1)}s`);
    }
    lines.push("");
    lines.push(`Summary: ${f.summary}`);
    lines.push("");
    lines.push("Answer (verbatim, truncated to 2000 characters):");
    lines.push("");
    lines.push("```");
    lines.push(String(f.answer ?? "").slice(0, 2000));
    lines.push("```");
    lines.push("");
  }
  lines.push("## Cost line");
  lines.push("");
  lines.push(`Requests: ${memo.requests}`);
  lines.push(`Total spent: $${memo.totalCostUsdc.toFixed(2)} USDC (testnet)`);
  lines.push("");
  lines.push(`Verification hash: ${memo.verificationHash}`);
  lines.push("");
  lines.push(
    "This memo is a testnet prototype built for a hackathon. It is not a listing decision and not financial advice. A human reviewer checks the evidence before any listing.",
  );
  return lines.join("\n");
}
