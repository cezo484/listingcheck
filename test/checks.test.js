import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadLimits, MAX_PRICE_PER_CALL_USDC, BUDGET_CAP_USDC } from "../src/config.js";
import {
  InputError,
  buildChecks,
  isAddress,
  readFinding,
  validateInput,
} from "../src/checks.js";
import { buildMemo, decide, memoHash, renderMarkdown, totalCostUsdc } from "../src/memo.js";
import { runDemo } from "../src/demo.js";

const TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913";

describe("input validation", () => {
  it("accepts a valid address and defaults the chain to base", () => {
    const input = validateInput({ token: TOKEN });
    assert.equal(input.chain, "base");
    assert.equal(input.social, null);
  });

  it("rejects a bad address", () => {
    assert.throws(() => validateInput({ token: "0x123" }), InputError);
    assert.throws(() => validateInput({ token: "not-an-address" }), InputError);
    assert.throws(() => validateInput({}), InputError);
  });

  it("rejects an unknown chain", () => {
    assert.throws(
      () => validateInput({ token: TOKEN, chain: "solana" }),
      InputError,
    );
  });

  it("rejects a bad social handle", () => {
    assert.throws(
      () => validateInput({ token: TOKEN, social: "not a handle!" }),
      InputError,
    );
  });

  it("adds the @ to a bare handle", () => {
    assert.equal(validateInput({ token: TOKEN, social: "circle" }).social, "@circle");
  });

  it("isAddress matches 0x plus 40 hex chars", () => {
    assert.equal(isAddress(TOKEN), true);
    assert.equal(isAddress("0x" + "ab".repeat(20)), true);
    assert.equal(isAddress("0x" + "ab".repeat(19)), false);
    assert.equal(isAddress("0x" + "zz".repeat(20)), false);
  });
});

describe("buildChecks", () => {
  it("builds four checks without a social handle", () => {
    const checks = buildChecks({ token: TOKEN });
    assert.equal(checks.length, 4);
    assert.deepEqual(
      checks.map((c) => c.key),
      ["audit", "onchain", "sanctions", "wash"],
    );
  });

  it("adds the social check when a handle is given", () => {
    const checks = buildChecks({ token: TOKEN, social: "@circle" });
    assert.equal(checks.length, 5);
    assert.equal(checks[4].key, "social");
    assert.match(checks[4].query, /@circle/);
  });

  it("puts the token address in every query and the chain where it applies", () => {
    const checks = buildChecks({ token: TOKEN, chain: "arbitrum" });
    for (const c of checks) {
      assert.match(c.query, new RegExp(TOKEN));
      // The sanctions query names the entity, not a chain: the intent
      // takes only a `name` param.
      if (c.key !== "sanctions") assert.match(c.query, /arbitrum/);
    }
  });

  it("names the token address as the screened entity", () => {
    const checks = buildChecks({ token: TOKEN });
    const sanctions = checks.find((c) => c.key === "sanctions");
    assert.match(sanctions.query, new RegExp(`entity named ${TOKEN}`));
  });

  it("names an integer block in the on-chain query", () => {
    const checks = buildChecks({ token: TOKEN, block: 26386345 });
    const onchain = checks.find((c) => c.key === "onchain");
    assert.match(onchain.query, /at block 26386345\?$/);
    assert.doesNotMatch(onchain.query, /latest/);
  });

  it("reads a base token on ethereum, the intent's supported chain", () => {
    const checks = buildChecks({ token: TOKEN, chain: "base" });
    const onchain = checks.find((c) => c.key === "onchain");
    assert.match(onchain.query, /on ethereum at block \d+/);
  });

  it("keeps a supported chain for the on-chain query", () => {
    const checks = buildChecks({ token: TOKEN, chain: "polygon" });
    const onchain = checks.find((c) => c.key === "onchain");
    assert.match(onchain.query, /on polygon at block \d+/);
  });

  it("uses canonical intent ids", () => {
    const checks = buildChecks({ token: TOKEN });
    for (const c of checks) {
      assert.match(c.intent, /_GENERAL$/);
    }
  });
});

describe("readFinding", () => {
  const check = (key) => ({ key, token: TOKEN, social: "@circle", intent: "X", label: key });

  it("reads a sanctions no-match as clear", () => {
    const f = readFinding(check("sanctions"), {
      answer: "No matches. Screened against OFAC SDN and EU lists.",
    });
    assert.equal(f.outcome, "clear");
  });

  it("reads a sanctions match as a flag", () => {
    const f = readFinding(check("sanctions"), {
      answer: "Matched: the wallet is listed on the OFAC SDN list.",
    });
    assert.equal(f.outcome, "flag");
  });

  it("reads a structured matched:false as clear, not a flag", () => {
    const f = readFinding(check("sanctions"), {
      answer: '{"name":"0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913","matched":false,"matches":null}',
    });
    assert.equal(f.outcome, "clear");
  });

  it("reads a structured matched:true as a flag", () => {
    const f = readFinding(check("sanctions"), {
      answer: '{"name":"0xabc","matched":true,"matches":["OFAC SDN"]}',
    });
    assert.equal(f.outcome, "flag");
  });

  it("reads a critical audit finding as a flag", () => {
    const f = readFinding(check("audit"), {
      answer: "Critical: reentrancy in withdraw allows draining the pool.",
    });
    assert.equal(f.outcome, "flag");
  });

  it("reads a clean audit as clear", () => {
    const f = readFinding(check("audit"), {
      answer: "No issue was found in the contract.",
    });
    assert.equal(f.outcome, "clear");
  });

  it("reads wash trading above 50 percent as a flag", () => {
    const f = readFinding(check("wash"), {
      answer: "Artificial share of volume: 72%.",
    });
    assert.equal(f.outcome, "flag");
  });

  it("reads a small wash share as caution", () => {
    const f = readFinding(check("wash"), {
      answer: "Artificial share of volume: 12%.",
    });
    assert.equal(f.outcome, "caution");
  });

  it("reads an unparseable answer as inconclusive, never a pass", () => {
    const f = readFinding(check("sanctions"), {
      answer: "The weather in Paris is fine today.",
    });
    assert.equal(f.outcome, "inconclusive");
  });

  it("marks a failed purchase as failed", () => {
    const f = readFinding(check("audit"), {
      status: "failed",
      error: "HTTP 500",
    });
    assert.equal(f.outcome, "failed");
    assert.match(f.summary, /HTTP 500/);
  });

  it("reads an on-chain balance value", () => {
    const f = readFinding(check("onchain"), {
      answer: `The balance of ${TOKEN} is 124000000 Gwei.`,
    });
    assert.equal(f.outcome, "clear");
    assert.match(f.value, /124000000/);
  });

  it("reads a structured balance_gwei answer as clear without the address echoed", () => {
    const f = readFinding(check("onchain"), {
      answer: '{"balance_gwei":10674908377,"address":null,"block":null,"chain":null,"tx_count":null}',
    });
    assert.equal(f.outcome, "clear");
    assert.equal(f.value, "10674908377");
  });

  it("reads a likely_human social verdict as clear", () => {
    const f = readFinding(check("social"), {
      answer: '{"account":"@circle","verdict":"likely_human","bot_score":null}',
    });
    assert.equal(f.outcome, "clear");
  });
});

describe("decide", () => {
  const finding = (key, outcome) => ({ key, outcome, label: key, summary: "" });

  it("recommends LIST only when every check is clear", () => {
    const d = decide([
      finding("audit", "clear"),
      finding("onchain", "clear"),
      finding("sanctions", "clear"),
      finding("wash", "clear"),
    ]);
    assert.equal(d.verdict, "LIST");
  });

  it("blocks on a sanctions flag", () => {
    const d = decide([
      finding("audit", "clear"),
      finding("sanctions", "flag"),
    ]);
    assert.equal(d.verdict, "DO NOT LIST");
    assert.match(d.reasons.join(" "), /Sanctions/);
  });

  it("blocks on a critical audit flag", () => {
    const d = decide([finding("audit", "flag")]);
    assert.equal(d.verdict, "DO NOT LIST");
  });

  it("sends caution to REVIEW", () => {
    const d = decide([
      finding("audit", "clear"),
      finding("wash", "caution"),
    ]);
    assert.equal(d.verdict, "REVIEW");
  });

  it("sends inconclusive to REVIEW", () => {
    const d = decide([finding("audit", "inconclusive")]);
    assert.equal(d.verdict, "REVIEW");
  });

  it("sends a failed check to REVIEW", () => {
    const d = decide([finding("audit", "failed")]);
    assert.equal(d.verdict, "REVIEW");
  });
});

describe("memo", () => {
  it("totals the cost and hashes the memo", () => {
    const findings = [
      { key: "a", outcome: "clear", label: "a", summary: "", amountUsdc: 0.01, minerId: "1", receiptHash: "r1", signalHash: "s1", txHash: "t1" },
      { key: "b", outcome: "clear", label: "b", summary: "", amountUsdc: 0.01, minerId: "2", receiptHash: "r2", signalHash: "s2", txHash: "t2" },
    ];
    assert.equal(totalCostUsdc(findings), 0.02);
    const memo = buildMemo({
      input: { token: TOKEN, chain: "base", social: null, claim: null },
      findings,
      startedAt: "2026-11-19T00:00:00.000Z",
      finishedAt: "2026-11-19T00:01:00.000Z",
      wallet: "0xabc",
    });
    assert.equal(memo.verdict, "LIST");
    assert.match(memo.verificationHash, /^[0-9a-f]{64}$/);
    assert.equal(memo.verificationHash, memoHash(memo));
    const md = renderMarkdown(memo);
    assert.match(md, /Verdict: LIST/);
    assert.match(md, /Total spent: \$0\.02 USDC/);
    assert.match(md, new RegExp(TOKEN));
  });
});

describe("demo", () => {
  it("runs the full pipeline on fixtures and lists the demo token", () => {
    const { memo, markdown } = runDemo();
    assert.equal(memo.demo, true);
    assert.equal(memo.verdict, "LIST");
    assert.equal(memo.findings.length, 5);
    assert.equal(memo.totalCostUsdc, 0.05);
    assert.match(markdown, /Listing risk memo/);
    assert.match(markdown, /Total spent: \$0\.05 USDC/);
  });
});

describe("spending limits", () => {
  it("env overrides can only lower the caps, never raise them", () => {
    const limits = loadLimits({
      LISTINGCHECK_MAX_PRICE_USDC: "99",
      LISTINGCHECK_BUDGET_USDC: "99",
    });
    assert.equal(limits.maxPricePerCallUsdc, MAX_PRICE_PER_CALL_USDC);
    assert.equal(limits.budgetCapUsdc, BUDGET_CAP_USDC);
  });

  it("env overrides below the caps apply", () => {
    const limits = loadLimits({
      LISTINGCHECK_MAX_PRICE_USDC: "0.01",
      LISTINGCHECK_BUDGET_USDC: "0.5",
    });
    assert.equal(limits.maxPricePerCallUsdc, 0.01);
    assert.equal(limits.budgetCapUsdc, 0.5);
  });

  it("ignores invalid env values", () => {
    const limits = loadLimits({
      LISTINGCHECK_MAX_PRICE_USDC: "abc",
      LISTINGCHECK_BUDGET_USDC: "-5",
    });
    assert.equal(limits.maxPricePerCallUsdc, MAX_PRICE_PER_CALL_USDC);
    assert.equal(limits.budgetCapUsdc, BUDGET_CAP_USDC);
  });
});
