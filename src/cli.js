#!/usr/bin/env node
// ListingCheck command line. Testnet only.
//
//   node src/cli.js check <token> [--chain base] [--social @handle]
//       [--claim "..."] [--route engine|direct] [--out dir]
//   node src/cli.js quote <intent> "<query>"      (unpaid, shows the live price)
//   node src/cli.js balance                        (testnet USDC balance)
//   node src/cli.js intents                        (live mission intents)
//   node src/cli.js demo                           (fixture run, no network)
//
// The testnet wallet key comes from TELEGRAPH_WALLET_PRIVATE_KEY, read
// from the environment or from a local .env file. The key is never
// printed and never written anywhere except that .env file.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  ETHEREUM_RPC,
  FALLBACK_ETH_BLOCK,
  INTENTS,
  NETWORK,
  SEPOLIA_RPC,
  USDC_ADDRESS,
  USDC_DECIMALS,
  loadLimits,
} from "./config.js";
import {
  AskFailedError,
  BudgetCapError,
  PaymentUnknownError,
  PriceGuardError,
  TelegraphClient,
} from "./telegraph.js";
import { InputError, buildChecks, readFinding, validateInput } from "./checks.js";
import { buildMemo, renderMarkdown } from "./memo.js";
import { ledgerEntry, writeRun } from "./ledger.js";
import { runDemo } from "./demo.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function loadEnvFile() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function walletAddress() {
  const key = process.env.TELEGRAPH_WALLET_PRIVATE_KEY;
  if (!key) return null;
  try {
    return privateKeyToAccount(key).address;
  } catch {
    return null;
  }
}

function makeClient() {
  loadEnvFile();
  const limits = loadLimits();
  return new TelegraphClient({
    privateKey: process.env.TELEGRAPH_WALLET_PRIVATE_KEY,
    maxPricePerCallUsdc: limits.maxPricePerCallUsdc,
    budgetCapUsdc: limits.budgetCapUsdc,
  });
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      flags[key] = value;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function usage() {
  console.log(`ListingCheck: a token-listing verification assistant (testnet).

Usage:
  check <token> [--chain base|ethereum|arbitrum|polygon] [--social @handle]
      [--claim "..."] [--route engine|direct] [--out dir]
        Buy the listing checks through Telegraph and print the memo.
        Each check costs about $0.01 testnet USDC. Default route: engine.
  quote <intent> "<query>"
        Show the live 402 price for a request. Unpaid, signs nothing.
  balance
        Show the testnet USDC balance of the wallet in .env.
  intents
        List the Mission 01 intents with live miner counts.
  demo
        Run the full memo on fixture answers. No network, no payment.

The wallet key comes from TELEGRAPH_WALLET_PRIVATE_KEY in .env.
See .env.example. Never put a real wallet key here; testnet only.`);
}

async function cmdIntents() {
  const client = makeClient();
  for (const [key, intent] of Object.entries(INTENTS)) {
    try {
      const detail = await client.getIntent(intent.id);
      const state = detail.lifecycle?.state ?? "unknown";
      console.log(`${intent.id} (${key}): ${detail.miner_count ?? "?"} miners, state ${state}`);
      console.log(`  ${intent.description}`);
    } catch (err) {
      console.log(`${intent.id} (${key}): lookup failed: ${err.message}`);
    }
  }
}

async function cmdBalance() {
  loadEnvFile();
  const address = walletAddress();
  if (!address) {
    console.error("No wallet key in .env. See .env.example.");
    process.exitCode = 1;
    return;
  }
  const client = createPublicClient({
    chain: sepolia,
    // Public Sepolia endpoints answer slowly from this VM; the default
    // 10s timeout is too short. This RPC is only used for the balance
    // display; payments never touch it (signing is local, settlement
    // is the facilitator's job).
    transport: http(SEPOLIA_RPC, { timeout: 60_000 }),
  });
  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [address],
  });
  console.log(`Wallet: ${address}`);
  console.log(`Network: ${NETWORK} (Ethereum Sepolia testnet)`);
  console.log(`USDC: ${(Number(balance) / USDC_DECIMALS).toFixed(2)} (testnet)`);
}

async function cmdQuote(intent, query) {
  if (!intent || !query) {
    console.error('Usage: quote <intent> "<query>"');
    process.exitCode = 1;
    return;
  }
  const client = makeClient();
  const q = await client.quote(intent, query);
  console.log(`Intent: ${q.intent}`);
  console.log(`Price: $${q.amountUsdc.toFixed(2)} USDC (${q.amountAtomic} atomic units)`);
  console.log(`Scheme: ${q.scheme}`);
  console.log(`Network: ${q.network}`);
  if (q.asset) console.log(`Asset: ${q.asset}`);
  console.log(`Pay to: ${q.payTo}`);
}

async function cmdCheck(token, flags) {
  const input = validateInput({
    token,
    chain: flags.chain,
    social: flags.social,
    claim: flags.claim,
  });
  // The onchain intent needs an integer block. Fetch the Ethereum head
  // so the read is current; if the lookup fails, the checks fall back
  // to a pinned recent block instead of failing the run.
  try {
    const eth = createPublicClient({
      chain: mainnet,
      transport: http(ETHEREUM_RPC, { timeout: 15_000 }),
    });
    input.block = Number(await eth.getBlockNumber());
  } catch {
    console.log(
      `Head-block lookup failed; using pinned block ${FALLBACK_ETH_BLOCK} for the on-chain check.`,
    );
  }
  const route = flags.route ?? "engine";
  if (route !== "engine" && route !== "direct") {
    throw new InputError(`unknown route "${route}". Use engine or direct.`);
  }
  const limits = loadLimits();
  const checks = buildChecks(input);
  // Upfront budget check: the worst case is every check at the per-call
  // cap. If that does not fit the budget, refuse before buying anything.
  const worstCase = checks.length * limits.maxPricePerCallUsdc;
  if (worstCase > limits.budgetCapUsdc) {
    throw new BudgetCapError(
      `worst case ${worstCase} USDC for ${checks.length} checks exceeds the budget cap ${limits.budgetCapUsdc}`,
    );
  }
  if (checks.length > limits.maxRequestsPerRun) {
    throw new BudgetCapError(
      `${checks.length} checks exceeds the per-run limit ${limits.maxRequestsPerRun}`,
    );
  }

  const client = makeClient();
  const startedAt = new Date().toISOString();
  console.log(
    `Checking ${input.token} on ${input.chain} (${checks.length} checks, route ${route}, budget cap $${limits.budgetCapUsdc} USDC testnet)`,
  );

  // The checks are independent, so they run in parallel, like the
  // listings desk in the mission example. A failed check does not stop
  // the others; it is recorded as failed in the memo.
  const settled = await Promise.allSettled(
    checks.map(async (check) => {
      const purchase =
        route === "direct"
          ? await client.buyDirect(check.intent, check.query)
          : await client.buyRouted(check.intent, check.query);
      return { check, purchase };
    }),
  );

  const findings = [];
  const entries = [];
  for (let i = 0; i < settled.length; i++) {
    const check = checks[i];
    const s = settled[i];
    if (s.status === "fulfilled") {
      findings.push(readFinding(check, s.value.purchase));
      entries.push(ledgerEntry(s.value.purchase, check));
    } else {
      findings.push(
        readFinding(check, { status: "failed", error: shortError(s.reason) }),
      );
      entries.push({
        at: new Date().toISOString(),
        check: check.key,
        intent: check.intent,
        query: check.query,
        route,
        status: "failed",
        error: shortError(s.reason),
      });
    }
  }

  const memo = buildMemo({
    input,
    findings,
    startedAt,
    finishedAt: new Date().toISOString(),
    wallet: walletAddress(),
  });
  const markdown = renderMarkdown(memo);
  console.log("");
  console.log(markdown);

  const outDir =
    flags.out ??
    join(ROOT, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
  writeRun(outDir, memo, entries);
  writeFileSync(join(outDir, "memo.md"), markdown + "\n");
  console.log(`\nSaved to ${outDir}`);
}

function shortError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 300);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  try {
    switch (command) {
      case "check":
        if (!positional[0]) {
          console.error("Usage: check <token> [options]");
          process.exitCode = 1;
          return;
        }
        await cmdCheck(positional[0], flags);
        break;
      case "quote":
        await cmdQuote(positional[0], positional[1]);
        break;
      case "balance":
        await cmdBalance();
        break;
      case "intents":
        await cmdIntents();
        break;
      case "demo": {
        const { markdown } = runDemo({
          token: positional[0],
          social: flags.social,
          claim: flags.claim,
        });
        console.log(markdown);
        break;
      }
      case undefined:
      case "help":
      case "--help":
        usage();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        usage();
        process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof InputError) {
      console.error(`Input error: ${err.message}`);
    } else if (err instanceof PriceGuardError) {
      console.error(`Price guard: ${err.message} Nothing was paid.`);
    } else if (err instanceof BudgetCapError) {
      console.error(`Budget cap: ${err.message} Nothing was paid.`);
    } else if (err instanceof PaymentUnknownError) {
      console.error(
        `Payment outcome unknown: ${err.message} Do not retry automatically; check the ledger and the wallet balance first.`,
      );
    } else if (err instanceof AskFailedError) {
      console.error(`Telegraph request failed: ${err.message}`);
    } else if (err instanceof Error && /TELEGRAPH_WALLET_PRIVATE_KEY/.test(err.message)) {
      console.error(err.message);
    } else {
      console.error(`Error: ${shortError(err)}`);
    }
    process.exitCode = 1;
  }
}

main();
