import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AskFailedError,
  BudgetCapError,
  PaymentUnknownError,
  PriceGuardError,
  TelegraphClient,
  answerText,
  escrowAccept,
  escrowMessage,
  escrowPaymentHeader,
  quotedAccept,
  rankMiners,
} from "../src/telegraph.js";
import { NETWORK, USDC_ADDRESS } from "../src/config.js";

const TEST_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function fakeResponse({ status = 200, headers = {}, body = {} }) {
  const lower = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => lower.get(k.toLowerCase()) ?? null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const challenge402 = (amount = "10000") =>
  fakeResponse({
    status: 402,
    headers: {
      "payment-required": b64({
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            asset: USDC_ADDRESS,
            amount,
            payTo: "0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e",
          },
          {
            scheme: "exact",
            network: "eip155:11155111",
            asset: "0xcc194e1a843B658526D0D5C431f670028582Ae17",
            amount: "10000",
            payTo: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
          },
        ],
      }),
    },
    body: { error: "payment required" },
  });

const settled200 = ({ amount = 10000 } = {}) =>
  fakeResponse({
    status: 200,
    headers: {
      "payment-response": b64({
        success: true,
        transaction: "0x" + "ab".repeat(32),
      }),
      "x-telegraph-receipt": b64({
        receipt_hash: "0x" + "cd".repeat(32),
        amount_uusdc: amount,
      }),
    },
    body: {
      miner_id: "7375",
      miner_name: "VerifyWire Onchain Metric Verify",
      result: "The balance is 124000000 Gwei.",
      signal_hash: "0x" + "ef".repeat(32),
    },
  });

// The escrow message template as the live devnode advertises it in the
// 402 challenge (extra.message of the escrow accept).
const ESCROW_TEMPLATE =
  "Telegraph Escrow Payment\n\nWallet: {from}\nPay To: 0x72a70e949362670bf8bcead24efc5b8f950aa08b\nNetwork: eip155:11155111\nAmount: 10000 uUSDC\nResource: /v1/ask\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}";

const escrowAcceptFixture = (amount = "10000") => ({
  scheme: "escrow",
  network: NETWORK,
  amount,
  payTo: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
  extra: {
    description: "Charged to the caller's Telegraph escrow balance.",
    message: ESCROW_TEMPLATE,
    resource: "/v1/ask",
    signWith: "personal_sign (EIP-191)",
  },
});

// A 402 offering both rails, like the live node does.
const challenge402Both = (escrowAmount = "10000", exactAmount = "10000") =>
  fakeResponse({
    status: 402,
    headers: {
      "payment-required": b64({
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            asset: USDC_ADDRESS,
            amount: exactAmount,
            payTo: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
          },
          escrowAcceptFixture(escrowAmount),
        ],
      }),
    },
    body: { error: "payment required" },
  });

// A 402 offering escrow only (no exact option).
const challenge402EscrowOnly = (amount = "10000") =>
  fakeResponse({
    status: 402,
    headers: {
      "payment-required": b64({ accepts: [escrowAcceptFixture(amount)] }),
    },
    body: { error: "payment required" },
  });

// A delivered escrow ask: the receipt comes on X-PAYMENT-RESPONSE and
// there is no on-chain settlement transaction.
const settledEscrow200 = ({ amount = 10000 } = {}) =>
  fakeResponse({
    status: 200,
    headers: {
      "x-payment-response": b64({ amount_uusdc: amount }),
      "x-telegraph-receipt": b64({
        receipt_hash: "0x" + "cd".repeat(32),
        amount_uusdc: amount,
      }),
    },
    body: {
      miner_id: "7375",
      miner_name: "VerifyWire Onchain Metric Verify",
      result: "The balance is 124000000 Gwei.",
      signal_hash: "0x" + "ef".repeat(32),
    },
  });

function clientWith({ fetchImpl, paymentFetch, spent = 0 }) {
  const client = new TelegraphClient({
    privateKey: TEST_KEY,
    maxPricePerCallUsdc: 0.02,
    budgetCapUsdc: 1.0,
    fetchImpl,
    paymentFetch,
  });
  client.spentUsdc = spent;
  return client;
}

describe("quotedAccept", () => {
  it("picks the exact option on our network and asset", () => {
    const a = quotedAccept(challenge402("10000"));
    assert.equal(a.amount, "10000");
    assert.equal(a.network, NETWORK);
    assert.equal(a.asset, USDC_ADDRESS);
  });

  it("returns null when no matching option exists", () => {
    const res = fakeResponse({
      status: 402,
      headers: {
        "payment-required": b64({
          accepts: [
            { scheme: "exact", network: "eip155:1", asset: "0xabc", amount: "1" },
          ],
        }),
      },
    });
    assert.equal(quotedAccept(res), null);
  });

  it("returns null on a broken header", () => {
    const res = fakeResponse({ status: 402, headers: {} });
    assert.equal(quotedAccept(res), null);
  });
});

describe("escrowAccept", () => {
  it("picks the escrow option on our network with its message", () => {
    const a = escrowAccept(challenge402Both("10000"));
    assert.equal(a.amount, "10000");
    assert.equal(a.network, NETWORK);
    assert.equal(a.payTo, "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b");
    assert.equal(a.message, ESCROW_TEMPLATE);
  });

  it("returns null when no escrow option exists", () => {
    assert.equal(escrowAccept(challenge402("10000")), null);
  });

  it("returns null when the escrow option has no message to sign", () => {
    const res = fakeResponse({
      status: 402,
      headers: {
        "payment-required": b64({
          accepts: [
            { scheme: "escrow", network: NETWORK, amount: "10000", extra: {} },
          ],
        }),
      },
    });
    assert.equal(escrowAccept(res), null);
  });
});

describe("escrowMessage", () => {
  it("substitutes the placeholders and lowercases the wallet", () => {
    const filled = escrowMessage(ESCROW_TEMPLATE, {
      from: "0x5FE684C303A4A9D53F02F29AA800F72C02A0DCA",
      nonce: "0xabc",
      validAfter: "100",
      validBefore: "170",
    });
    assert.match(filled, /Wallet: 0x5fe684c303a4a9d53f02f29aa800f72c02a0dca/);
    assert.match(filled, /Nonce: 0xabc/);
    assert.match(filled, /Valid After: 100/);
    assert.match(filled, /Valid Before: 170/);
    assert.doesNotMatch(filled, /\{(from|nonce|validAfter|validBefore)\}/);
  });
});

describe("escrowPaymentHeader", () => {
  it("builds a base64 envelope whose signature recovers to the wallet", async () => {
    const account = privateKeyToAccount(TEST_KEY);
    const header = await escrowPaymentHeader(
      account,
      escrowAccept(challenge402Both("10000")),
      1_700_000_000,
    );
    const envelope = JSON.parse(
      Buffer.from(header, "base64").toString("utf8"),
    );
    assert.equal(envelope.x402Version, 2);
    assert.equal(envelope.scheme, "escrow");
    assert.equal(envelope.network, NETWORK);
    const { signature, authorization } = envelope.payload;
    assert.equal(authorization.from, account.address);
    assert.equal(authorization.to, "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b");
    assert.equal(authorization.value, "10000");
    assert.equal(authorization.validAfter, "1699999990");
    assert.equal(authorization.validBefore, "1700000060");
    assert.match(authorization.nonce, /^0x[0-9a-f]{64}$/);
    const message = escrowMessage(ESCROW_TEMPLATE, authorization);
    const recovered = await recoverMessageAddress({ message, signature });
    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  });
});

describe("answerText", () => {
  it("passes strings through", () => {
    assert.equal(answerText("hello"), "hello");
  });

  it("reads the answer field of an object", () => {
    assert.equal(answerText({ answer: "yes" }), "yes");
  });

  it("stringifies other shapes", () => {
    assert.equal(answerText({ a: 1 }), '{"a":1}');
  });
});

describe("rankMiners", () => {
  it("keeps only scored miners with an endpoint, sorted by rank", () => {
    const miners = [
      {
        id: "2",
        name: "B",
        endpoints: [{ path: "/q", method: "GET", description: "INTENT_X" }],
        scores: [{ intent_id: "INTENT_X", rank: 2, score: 0.5 }],
      },
      {
        id: "1",
        name: "A",
        endpoints: [{ path: "/q", method: "GET", description: "INTENT_X" }],
        scores: [{ intent_id: "INTENT_X", rank: 1, score: 0.9 }],
      },
      {
        id: "3",
        name: "C",
        endpoints: [{ path: "/q", method: "GET", description: "INTENT_X" }],
        scores: [],
      },
      {
        id: "4",
        name: "D",
        endpoints: [],
        scores: [{ intent_id: "INTENT_X", rank: 3, score: 0.1 }],
      },
    ];
    const ranked = rankMiners("INTENT_X", miners);
    assert.deepEqual(
      ranked.map((m) => m.id),
      ["1", "2"],
    );
    assert.equal(ranked[0].score, 0.9);
  });
});

describe("TelegraphClient.quote", () => {
  it("returns the live price from the 402 challenge", async () => {
    const client = clientWith({
      fetchImpl: async () => challenge402("10000"),
    });
    const q = await client.quote("SOME_INTENT", "some query");
    assert.equal(q.amountUsdc, 0.01);
    assert.equal(q.network, NETWORK);
  });

  it("throws when the node does not answer 402", async () => {
    const client = clientWith({
      fetchImpl: async () => fakeResponse({ status: 200, body: {} }),
    });
    await assert.rejects(() => client.quote("X", "y"), AskFailedError);
  });
});

describe("TelegraphClient.pay", () => {
  it("pays the quote and records the settlement proof", async () => {
    const client = clientWith({
      fetchImpl: async () => challenge402("10000"),
      paymentFetch: async () => settled200(),
    });
    const p = await client.pay(
      "https://devnode.telegraphprotocol.com/engine/v1/ask",
      { method: "POST", body: "{}" },
      "SOME_INTENT",
      null,
    );
    assert.equal(p.route, "engine");
    assert.equal(p.minerId, "7375");
    assert.equal(p.amountUsdc, 0.01);
    assert.equal(p.txHash, "0x" + "ab".repeat(32));
    assert.match(p.txUrl, /sepolia\.etherscan\.io\/tx\/0x/);
    assert.equal(p.receiptHash, "0x" + "cd".repeat(32));
    assert.equal(p.signalHash, "0x" + "ef".repeat(32));
    assert.equal(p.answer, "The balance is 124000000 Gwei.");
    assert.equal(client.spentUsdc, 0.01);
  });

  it("refuses a quote above the per-call cap and pays nothing", async () => {
    let paid = false;
    const client = clientWith({
      fetchImpl: async () => challenge402("50000"),
      paymentFetch: async () => {
        paid = true;
        return settled200();
      },
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      PriceGuardError,
    );
    assert.equal(paid, false);
    assert.equal(client.spentUsdc, 0);
  });

  it("refuses when the worst case exceeds the budget", async () => {
    let paid = false;
    const client = clientWith({
      fetchImpl: async () => challenge402("10000"),
      paymentFetch: async () => {
        paid = true;
        return settled200();
      },
      spent: 0.99,
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      BudgetCapError,
    );
    assert.equal(paid, false);
  });

  it("raises PaymentUnknownError when the paid call gets no response", async () => {
    const client = clientWith({
      fetchImpl: async () => challenge402("10000"),
      paymentFetch: async () => {
        throw new Error("network down");
      },
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      PaymentUnknownError,
    );
  });

  it("raises PaymentUnknownError when the answer carries no settlement proof", async () => {
    const client = clientWith({
      fetchImpl: async () => challenge402("10000"),
      paymentFetch: async () => fakeResponse({ status: 200, body: {} }),
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      PaymentUnknownError,
    );
  });

  it("treats a settlement success:false as a plain failure", async () => {
    const client = clientWith({
      fetchImpl: async () => challenge402("10000"),
      paymentFetch: async () =>
        fakeResponse({
          status: 200,
          headers: {
            "payment-response": b64({ success: false }),
          },
          body: {},
        }),
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      AskFailedError,
    );
  });
});

describe("TelegraphClient.pay over escrow", () => {
  it("pays via escrow first and never touches the exact path", async () => {
    const calls = [];
    const client = clientWith({
      fetchImpl: async (url, init) => {
        calls.push(new Headers(init?.headers).get("X-PAYMENT"));
        return calls.length === 1
          ? challenge402Both("10000")
          : settledEscrow200();
      },
      paymentFetch: async () => {
        throw new Error("exact path must not run when escrow succeeds");
      },
    });
    const p = await client.pay(
      "https://devnode.telegraphprotocol.com/engine/v1/ask",
      { method: "POST", body: "{}" },
      "SOME_INTENT",
      null,
    );
    assert.equal(p.paymentRail, "escrow");
    assert.equal(p.amountUsdc, 0.01);
    assert.equal(p.txHash, "");
    assert.equal(p.txUrl, "");
    assert.equal(p.receiptHash, "0x" + "cd".repeat(32));
    assert.equal(p.answer, "The balance is 124000000 Gwei.");
    assert.equal(p.usdcContract, USDC_ADDRESS);
    assert.equal(client.spentUsdc, 0.01);
    // First call unpaid, second call carries the signed escrow envelope.
    assert.equal(calls[0], null);
    assert.ok(typeof calls[1] === "string" && calls[1].length > 100);
    const envelope = JSON.parse(
      Buffer.from(calls[1], "base64").toString("utf8"),
    );
    assert.equal(envelope.scheme, "escrow");
    assert.equal(envelope.payload.authorization.value, "10000");
  });

  it("falls back to exact when escrow refuses with a 402", async () => {
    let fetchCalls = 0;
    const client = clientWith({
      fetchImpl: async () => {
        fetchCalls += 1;
        // Quote, then the escrow attempt refused.
        return challenge402Both("10000");
      },
      paymentFetch: async () => settled200(),
    });
    const p = await client.pay(
      "https://devnode.telegraphprotocol.com/engine/v1/ask",
      { method: "POST", body: "{}" },
      "SOME_INTENT",
      null,
    );
    assert.equal(p.paymentRail, "exact");
    assert.equal(p.txHash, "0x" + "ab".repeat(32));
    assert.equal(fetchCalls, 2);
  });

  it("fails plainly when escrow refuses and no exact option exists", async () => {
    const client = clientWith({
      fetchImpl: async () => challenge402EscrowOnly("10000"),
      paymentFetch: async () => {
        throw new Error("exact path must not run without an exact accept");
      },
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      AskFailedError,
    );
    assert.equal(client.spentUsdc, 0);
  });

  it("refuses an escrow quote above the per-call cap and pays nothing", async () => {
    let fetchCalls = 0;
    const client = clientWith({
      fetchImpl: async () => {
        fetchCalls += 1;
        return challenge402Both("50000");
      },
      paymentFetch: async () => {
        throw new Error("exact path must not run past the price guard");
      },
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      PriceGuardError,
    );
    // Only the unpaid quote went out; no escrow attempt was made.
    assert.equal(fetchCalls, 1);
    assert.equal(client.spentUsdc, 0);
  });

  it("raises PaymentUnknownError when the escrow call gets no response", async () => {
    let calls = 0;
    const client = clientWith({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return challenge402Both("10000");
        throw new Error("network down");
      },
    });
    await assert.rejects(
      () =>
        client.pay("https://example.invalid/ask", {}, "SOME_INTENT", null),
      PaymentUnknownError,
    );
  });
});

describe("TelegraphClient.quote over escrow", () => {
  it("reads the price from the escrow option when offered", async () => {
    const client = clientWith({
      fetchImpl: async () => challenge402Both("10000", "20000"),
    });
    const q = await client.quote("SOME_INTENT", "some query");
    assert.equal(q.scheme, "escrow");
    assert.equal(q.amountUsdc, 0.01);
    assert.equal(q.asset, null);
  });
});

describe("TelegraphClient.buyDirect", () => {
  it("steps down to the next miner when the first fails", async () => {
    const miners = [
      {
        id: "1",
        name: "First",
        endpoints: [{ path: "/q", method: "GET", description: "INTENT_X" }],
        scores: [{ intent_id: "INTENT_X", rank: 1, score: 0.9 }],
      },
      {
        id: "2",
        name: "Second",
        endpoints: [{ path: "/q", method: "GET", description: "INTENT_X" }],
        scores: [{ intent_id: "INTENT_X", rank: 2, score: 0.5 }],
      },
    ];
    let calls = 0;
    const client = clientWith({
      fetchImpl: async (url) => {
        if (String(url).includes("/api/miners")) {
          return fakeResponse({ status: 200, body: miners });
        }
        return challenge402("10000");
      },
      paymentFetch: async (url) => {
        calls += 1;
        if (String(url).endsWith("/ask/1")) {
          return fakeResponse({ status: 500, body: "miner down" });
        }
        return settled200();
      },
    });
    const p = await client.buyDirect("INTENT_X", "some query");
    assert.equal(p.route, "direct");
    assert.equal(p.minerRank, 2);
    assert.equal(calls, 2);
  });
});
