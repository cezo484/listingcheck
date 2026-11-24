// Builds the listing checks from the operator input and reads the
// purchased answers back into findings. Each check buys one Intent
// through Telegraph. The queries are written so the miner can answer
// from the token address alone; no extra context is assumed.

import { CHAINS, FALLBACK_ETH_BLOCK, INTENTS, ONCHAIN_CHAINS } from "./config.js";

export class InputError extends Error {}

export function isAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function validateInput({ token, chain, social, claim, block }) {
  if (!isAddress(token)) {
    throw new InputError(
      `not an EVM address: ${String(token).slice(0, 80)}. Give the token contract address, 0x followed by 40 hex characters.`,
    );
  }
  if (chain !== undefined && !CHAINS.includes(chain)) {
    throw new InputError(
      `unknown chain "${chain}". Use one of: ${CHAINS.join(", ")}.`,
    );
  }
  if (social !== undefined && social !== null) {
    if (!/^@?[A-Za-z0-9_]{1,50}$/.test(social)) {
      throw new InputError(
        `not a social handle: ${String(social).slice(0, 80)}. Give a handle like @projectname.`,
      );
    }
  }
  if (claim !== undefined && claim !== null && claim.length > 500) {
    throw new InputError("the claim is too long; keep it under 500 characters.");
  }
  if (
    block !== undefined &&
    block !== null &&
    (!Number.isInteger(block) || block <= 0)
  ) {
    throw new InputError("block must be a positive integer.");
  }
  return {
    token,
    chain: chain ?? "base",
    social: social ? (social.startsWith("@") ? social : `@${social}`) : null,
    claim: claim ?? null,
    block: block ?? null,
  };
}

// The five checks of the listings desk. The social check only runs when
// the operator gives a handle; the other four always run.
//
// The onchain query follows the intent's canonical question template
// ("What is the native-coin balance, in Gwei, of address {address} on
// {chain} at block {block}?"): the intent requires an integer block and
// a chain from its own enum, and refuses anything else with HTTP 400.
// A token on a chain the intent does not serve (base, optimism) is
// read on ethereum; the query names the chain actually read.
export function buildChecks(input) {
  const { token, chain, social, block } = validateInput(input);
  const onchainChain = ONCHAIN_CHAINS.includes(chain) ? chain : "ethereum";
  const onchainBlock = block ?? FALLBACK_ETH_BLOCK;
  const checks = [
    {
      key: "audit",
      token,
      social,
      intent: INTENTS.audit.id,
      label: INTENTS.audit.label,
      query: `Audit the smart contract at address ${token} on ${chain} for reentrancy, access control, and integer overflow risks. Report each finding with severity, or state clearly that no issue was found.`,
    },
    {
      key: "onchain",
      token,
      social,
      intent: INTENTS.onchain.id,
      label: INTENTS.onchain.label,
      query: `What is the native-coin balance, in Gwei, of address ${token} on ${onchainChain} at block ${onchainBlock}?`,
    },
    {
      key: "sanctions",
      token,
      social,
      intent: INTENTS.sanctions.id,
      label: INTENTS.sanctions.label,
      // The intent's only required param is `name` ("Person or entity
      // name"); a query with no name is refused with HTTP 400. The
      // address itself is the entity screened, so it is named as such.
      query: `Screen the entity named ${token} against the OFAC SDN, OFAC non-SDN consolidated, UN Security Council, and EU consolidated financial sanctions lists. Report whether it matches any list, and name the list for each match.`,
    },
    {
      key: "wash",
      token,
      social,
      intent: INTENTS.wash.id,
      label: INTENTS.wash.label,
      query: `Is trading volume on token ${token} on ${chain} wash traded? Check for circular transfers between affiliated wallets and report the share of volume that looks artificial.`,
    },
  ];
  if (social) {
    checks.push({
      key: "social",
      token,
      social,
      intent: INTENTS.social.id,
      label: INTENTS.social.label,
      query: `Is ${social} a bot? Check posting cadence, follower-graph clustering, and coordination with other accounts, and report a verdict with the signals behind it.`,
    });
  }
  return checks;
}

// Reads a purchased answer into a finding. Miner answers are free text,
// so the reading is conservative: a check the reader cannot parse is
// "inconclusive", never a pass. The raw answer is always kept next to
// the reading, so a human can check it.
export function readFinding(check, purchase) {
  const answer = purchase?.answer ?? "";
  const lower = answer.toLowerCase();
  const base = {
    key: check.key,
    intent: check.intent,
    label: check.label,
    minerId: purchase?.minerId ?? "",
    minerName: purchase?.minerName ?? "",
    minerRank: purchase?.minerRank ?? null,
    amountUsdc: purchase?.amountUsdc ?? 0,
    txHash: purchase?.txHash ?? "",
    txUrl: purchase?.txUrl ?? "",
    receiptHash: purchase?.receiptHash ?? "",
    signalHash: purchase?.signalHash ?? "",
    latencyMs: purchase?.latencyMs ?? null,
    route: purchase?.route ?? "",
    paymentRail: purchase?.paymentRail ?? "",
    answer,
  };

  if (!purchase || purchase.status === "failed") {
    return { ...base, outcome: "failed", summary: purchase?.error ?? "the purchase failed" };
  }
  // The answer should be about the subject we asked about. When it does
  // not mention the token address (or the handle for the social check),
  // it cannot support a verdict either way.
  const subject = check.key === "social" ? check.social : check.token;
  const mentionsSubject =
    subject && lower.includes(String(subject).toLowerCase().replace(/^@/, ""));

  switch (check.key) {
    case "sanctions": {
      // Structured answers carry the verdict as a field; read it
      // first, because "matched":false would otherwise trip the
      // match-word check below and read as a false flag.
      if (/"matched"\s*:\s*false/i.test(answer)) {
        return { ...base, outcome: "clear", summary: "No sanctions list match reported." };
      }
      if (/"matched"\s*:\s*true/i.test(answer)) {
        return { ...base, outcome: "flag", summary: "The answer reports a sanctions list match. Treat as a blocking flag until a human checks the match." };
      }
      if (/\bno (match|matches|hits?)\b/.test(lower) || /not (listed|found|matched)/.test(lower)) {
        return { ...base, outcome: "clear", summary: "No sanctions list match reported." };
      }
      if (/\bmatch(es|ed)?\b/.test(lower) || /\blisted\b/.test(lower)) {
        return { ...base, outcome: "flag", summary: "The answer reports a sanctions list match. Treat as a blocking flag until a human checks the match." };
      }
      return { ...base, outcome: "inconclusive", summary: "The answer could not be read as a clear match or no-match." };
    }
    case "audit": {
      if (/critical|high severity|severe/i.test(answer)) {
        return { ...base, outcome: "flag", summary: "The audit reports a critical or high severity finding." };
      }
      if (/no (issue|issues|vulnerabilit|finding)/i.test(answer)) {
        return { ...base, outcome: "clear", summary: "The audit reports no issue." };
      }
      if (/medium|low severity|minor/i.test(answer)) {
        return { ...base, outcome: "caution", summary: "The audit reports medium or low severity findings." };
      }
      return { ...base, outcome: "inconclusive", summary: "The audit answer could not be read as a clear pass or fail." };
    }
    case "onchain": {
      // Prefer a number with a unit (124000000 Gwei). A bare number is
      // only a fallback, and a number that is part of a 0x address does
      // not count: the address itself starts with 0x. A trailing comma
      // (from a JSON answer like {"balance_gwei": 123,}) is not part
      // of the number. A structured answer carrying the intent's own
      // balance_gwei field is a direct read for this query even when
      // it does not echo the address back.
      const withUnit = answer.match(/(\d[\d,]*(?:\.\d+)?)\s*(gwei|wei|eth|ether)\b/i);
      const bare = withUnit
        ? null
        : answer.replace(/0x[0-9a-fA-F]+/g, "").match(/(\d[\d,]*(?:\.\d+)?)/);
      const m = withUnit ?? bare;
      if (m) {
        const value = m[0].trim().replace(/,+$/, "");
        const structured = /"balance_gwei"\s*:/.test(answer);
        return {
          ...base,
          outcome: mentionsSubject === false && !structured ? "inconclusive" : "clear",
          summary: `On-chain balance reported as ${value}.`,
          value,
        };
      }
      return { ...base, outcome: "inconclusive", summary: "No balance value could be read from the answer." };
    }
    case "wash": {
      const pct = answer.match(/(\d+(?:\.\d+)?)\s*%/);
      if (/no (wash|artificial|evidence of wash)/i.test(answer)) {
        return { ...base, outcome: "clear", summary: "No wash trading reported." };
      }
      if (pct) {
        const v = Number(pct[1]);
        if (v >= 50) {
          return { ...base, outcome: "flag", summary: `The answer reports ${pct[0]} of volume as artificial.` };
        }
        if (v > 0) {
          return { ...base, outcome: "caution", summary: `The answer reports ${pct[0]} of volume as artificial.` };
        }
      }
      if (/wash trad/i.test(answer)) {
        return { ...base, outcome: "caution", summary: "The answer discusses wash trading but gives no share." };
      }
      return { ...base, outcome: "inconclusive", summary: "The answer could not be read as a clear wash trading verdict." };
    }
    case "social": {
      if (/\bnot a bot\b/i.test(answer) || /\bhuman\b/i.test(answer) || /likely_human/i.test(answer)) {
        return { ...base, outcome: "clear", summary: "The account is reported as human." };
      }
      if (/\bbot\b/i.test(answer)) {
        return { ...base, outcome: "flag", summary: "The account is reported as a bot or coordinated." };
      }
      return { ...base, outcome: "inconclusive", summary: "The answer could not be read as a clear bot verdict." };
    }
    default:
      return { ...base, outcome: "inconclusive", summary: "Unknown check." };
  }
}
