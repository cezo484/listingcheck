// Demo run: the full memo pipeline on saved fixture answers. Nothing
// touches the network and nothing is paid. The fixtures mirror the shape
// of real Telegraph answers; the memo they produce is labelled a demo so
// it can never be mistaken for a paid run.

import { buildChecks, readFinding } from "./checks.js";
import { buildMemo, renderMarkdown } from "./memo.js";

export const DEMO_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913";

export const DEMO_FIXTURES = {
  audit: {
    route: "demo",
    minerId: "demo-audit",
    minerName: "Demo audit miner",
    minerRank: null,
    amountUsdc: 0.01,
    txHash: "",
    txUrl: "",
    receiptHash: "",
    signalHash: "",
    latencyMs: 1200,
    answer:
      "No issue was found. The contract is a standard ERC-20 with owner-controlled mint and a pauser role. No reentrancy path was found in the transfer or approval functions, and the arithmetic uses checked operations.",
  },
  onchain: {
    route: "demo",
    minerId: "demo-onchain",
    minerName: "Demo on-chain miner",
    minerRank: null,
    amountUsdc: 0.01,
    txHash: "",
    txUrl: "",
    receiptHash: "",
    signalHash: "",
    latencyMs: 800,
    answer:
      "The native-coin balance of address 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 on base at block latest is 124000000 Gwei.",
  },
  sanctions: {
    route: "demo",
    minerId: "demo-sanctions",
    minerName: "Demo sanctions miner",
    minerRank: null,
    amountUsdc: 0.01,
    txHash: "",
    txUrl: "",
    receiptHash: "",
    signalHash: "",
    latencyMs: 600,
    answer:
      "No matches. The wallet 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 was screened against the OFAC SDN, OFAC non-SDN consolidated, UN Security Council, and EU consolidated lists. No match was found on any list.",
  },
  wash: {
    route: "demo",
    minerId: "demo-wash",
    minerName: "Demo wash trading miner",
    minerRank: null,
    amountUsdc: 0.01,
    txHash: "",
    txUrl: "",
    receiptHash: "",
    signalHash: "",
    latencyMs: 1500,
    answer:
      "No wash trading detected. Volume on token 0x833589fCD6eDb6E08f4c7C32D4f71B54bda02913 on base shows no circular transfers between affiliated wallets. Artificial share of volume: 0%.",
  },
  social: {
    route: "demo",
    minerId: "demo-social",
    minerName: "Demo social miner",
    minerRank: null,
    amountUsdc: 0.01,
    txHash: "",
    txUrl: "",
    receiptHash: "",
    signalHash: "",
    latencyMs: 900,
    answer:
      "The account @circle is human. Posting cadence is irregular, the follower graph shows no clustering, and no coordination with other accounts was found.",
  },
};

export function runDemo(input = {}) {
  const startedAt = new Date().toISOString();
  const fullInput = {
    token: input.token ?? DEMO_TOKEN,
    chain: input.chain ?? "base",
    social: input.social ?? "@circle",
    claim: input.claim ?? "USDC is listed on major exchanges.",
  };
  const checks = buildChecks(fullInput);
  const findings = checks.map((check) =>
    readFinding(check, DEMO_FIXTURES[check.key]),
  );
  const memo = buildMemo({
    input: fullInput,
    findings,
    startedAt,
    finishedAt: new Date().toISOString(),
    wallet: "demo (no wallet used)",
  });
  memo.demo = true;
  return { memo, markdown: renderMarkdown(memo) };
}
