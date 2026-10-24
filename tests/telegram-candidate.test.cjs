const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("telegram-watcher.js", "utf8");
const match = source.match(
  /function validCandidateLevels\(analysis\) \{[\s\S]*?\n\}\n\nfunction isTradeCandidate\(analysis\) \{[\s\S]*?\n\}/
);

if (!match) {
  throw new Error("Could not locate validCandidateLevels in telegram-watcher.js");
}

const context = {};
vm.createContext(context);

const validate = vm.runInContext(
  `${match[0]}\nvalidCandidateLevels`,
  context
);

const isTradeCandidate = vm.runInContext(
  `${match[0]}\nisTradeCandidate`,
  context
);

function bullish(overrides = {}) {
  return {
    style: { bias: "BULLISH" },
    risk: {
      entryLow: 99,
      entryHigh: 101,
      entryReference: 100,
      stopLoss: 98,
      target1: 103,
      target2: 105,
      rr1: 1.5,
      rr2: 2.5,
      riskReward: 2.5,
      directionalContext: "BULLISH",
      ...overrides
    }
  };
}

function bearish(overrides = {}) {
  return {
    style: { bias: "BEARISH" },
    risk: {
      entryLow: 99,
      entryHigh: 101,
      entryReference: 100,
      stopLoss: 102,
      target1: 97,
      target2: 95,
      rr1: 1.5,
      rr2: 2.5,
      riskReward: 2.5,
      directionalContext: "BEARISH",
      ...overrides
    }
  };
}

test("valid bullish levels and matching R:R are accepted", () => {
  assert.equal(validate(bullish()), true);
});

test("valid bearish levels and matching R:R are accepted", () => {
  assert.equal(validate(bearish()), true);
});

test("bullish target below 1.5R is rejected", () => {
  assert.equal(validate(bullish({ target1: 102.9, rr1: 1.45 })), false);
});

test("bearish target below 1.5R is rejected", () => {
  assert.equal(validate(bearish({ target1: 97.1, rr1: 1.45 })), false);
});

test("incorrect reported T1 R:R is rejected", () => {
  assert.equal(validate(bullish({ rr1: 2 })), false);
});

test("incorrect reported T2 R:R is rejected", () => {
  assert.equal(validate(bearish({ rr2: 3 })), false);
});

test("missing or inconsistent overall riskReward is rejected", () => {
  assert.equal(validate(bullish({ riskReward: undefined })), false);
  assert.equal(validate(bullish({ riskReward: 3 })), false);
  assert.equal(validate(bearish({ riskReward: 3 })), false);
});

test("overall riskReward matching actual T2 R:R is accepted", () => {
  assert.equal(validate(bullish({ riskReward: 2.5 })), true);
  assert.equal(validate(bearish({ riskReward: 2.5 })), true);
});

test("target order inconsistent with direction is rejected", () => {
  assert.equal(validate(bullish({ target2: 102 })), false);
});

test("missing T2 or T2 R:R is rejected rather than advertised", () => {
  assert.equal(validate(bullish({ target2: NaN })), false);
  assert.equal(validate(bearish({ rr2: NaN })), false);
});


test("actual candidate gate accepts valid bullish risk only with both confirmations", () => {
  const analysis = bullish();
  analysis.style.plan = { status: "TRADE-CANDIDATE" };
  analysis.risk.decision = "TRADE-CANDIDATE";

  assert.equal(isTradeCandidate(analysis), true);

  analysis.risk.decision = "WAIT";
  assert.equal(isTradeCandidate(analysis), false);

  analysis.risk.decision = "TRADE-CANDIDATE";
  analysis.style.plan.status = "WAIT";
  assert.equal(isTradeCandidate(analysis), false);
});

test("actual candidate gate rejects invalid levels even when both engines confirm", () => {
  const analysis = bullish({ stopLoss: 101 });
  analysis.style.plan = { status: "TRADE-CANDIDATE" };
  analysis.risk.decision = "TRADE-CANDIDATE";

  assert.equal(isTradeCandidate(analysis), false);
});

test("actual candidate gate rejects bullish Style versus bearish Risk", () => {
  const analysis = bullish();
  analysis.style.plan = { status: "TRADE-CANDIDATE" };
  analysis.risk.decision = "TRADE-CANDIDATE";
  analysis.risk.directionalContext = "BEARISH";

  assert.equal(isTradeCandidate(analysis), false);
});

test("actual candidate gate rejects bearish Style versus bullish Risk", () => {
  const analysis = bearish();
  analysis.style.plan = { status: "TRADE-CANDIDATE" };
  analysis.risk.decision = "TRADE-CANDIDATE";
  analysis.risk.directionalContext = "BULLISH";

  assert.equal(isTradeCandidate(analysis), false);
});


test("Telegram validator rejects neutral, unknown, or ambiguous Risk direction", () => {
  for (const direction of [
    "NEUTRAL / CONFLICTED",
    "NO CLEAN DIRECTION",
    "",
    "UNKNOWN",
    "BULLISH / BEARISH CONFLICT"
  ]) {
    assert.equal(
      validate(bullish({ directionalContext: direction })),
      false,
      `Should reject Risk direction: ${direction}`
    );
  }
});

test("Telegram validator rejects malformed substring directions", () => {
  assert.equal(
    validate(bullish({ directionalContext: "NOT BULLISH" })),
    false
  );

  const analysis = bullish();
  analysis.style.bias = "NOT BULLISH";
  assert.equal(validate(analysis), false);
});

test("Telegram validator rejects missing or unclear Style direction", () => {
  for (const direction of ["", "NEUTRAL", "BULLISH / BEARISH"]) {
    const analysis = bullish();
    analysis.style.bias = direction;
    assert.equal(validate(analysis), false);
  }

  const analysis = bullish();
  delete analysis.style.bias;
  assert.equal(validate(analysis), false);
});

test("Telegram validator accepts matching unconfirmed directions", () => {
  assert.equal(
    validate(bullish({
      directionalContext: "BULLISH — UNCONFIRMED"
    })),
    true
  );

  assert.equal(
    validate(bearish({
      directionalContext: "BEARISH — UNCONFIRMED"
    })),
    true
  );
});

test("actual candidate gate rejects neutral Risk direction", () => {
  const analysis = bullish({
    directionalContext: "NEUTRAL / CONFLICTED"
  });
  analysis.style.plan = { status: "TRADE-CANDIDATE" };
  analysis.risk.decision = "TRADE-CANDIDATE";

  assert.equal(isTradeCandidate(analysis), false);
});


test("accepts mathematically 1.5R when floating-point subtraction is slightly low", () => {
  const entry = 61.71967708970946;
  const stop = 61.70918992627398;
  const risk = entry - stop;
  const target1 = 61.73540783486267;
  const target2 = 61.745894998298155;
  const rr2 = (target2 - entry) / risk;
  const analysis = {
    style: { bias: "BULLISH" },
    risk: {
      entryLow: entry - risk * 0.1,
      entryHigh: entry + risk * 0.1,
      entryReference: entry,
      stopLoss: stop,
      target1,
      target2,
      rr1: 1.5,
      rr2,
      riskReward: rr2,
      directionalContext: "BULLISH"
    }
  };
  assert.ok((target1 - entry) / risk < 1.5);
  assert.equal(validate(analysis), true);
});

test("rejects genuinely sub-1.5R levels beyond the numeric tolerance", () => {
  const entry = 100;
  const stop = 98;
  const risk = entry - stop;
  const target1 = entry + risk * (1.5 - 1e-9);
  const target2 = entry + risk * 2.5;
  const rr1 = (target1 - entry) / risk;
  const rr2 = (target2 - entry) / risk;
  const analysis = {
    style: { bias: "BULLISH" },
    risk: {
      entryLow: 99.8,
      entryHigh: 100.2,
      entryReference: entry,
      stopLoss: stop,
      target1,
      target2,
      rr1,
      rr2,
      riskReward: rr2,
      directionalContext: "BULLISH"
    }
  };
  assert.equal(validate(analysis), false);
});


test("accepts bearish mathematically 1.5R when floating-point subtraction is slightly low", () => {
  const entry = 0.3003194018075712;
  const stop = 0.32660350429266444;
  const risk = stop - entry;
  const target1 = 0.2608932480799314;
  const target2 = entry - risk * 2.5;
  const rr2 = (entry - target2) / risk;
  const analysis = {
    style: { bias: "BEARISH" },
    risk: {
      entryLow: entry - risk * 0.1,
      entryHigh: entry + risk * 0.1,
      entryReference: entry,
      stopLoss: stop,
      target1,
      target2,
      rr1: 1.5,
      rr2,
      riskReward: rr2,
      directionalContext: "BEARISH"
    }
  };
  assert.ok((entry - target1) / risk < 1.5);
  assert.equal(validate(analysis), true);
});

test("rejects genuinely bearish sub-1.5R levels beyond the numeric tolerance", () => {
  const entry = 100;
  const stop = 102;
  const risk = stop - entry;
  const target1 = entry - risk * (1.5 - 1e-9);
  const target2 = entry - risk * 2.5;
  const rr1 = (entry - target1) / risk;
  const rr2 = (entry - target2) / risk;
  const analysis = {
    style: { bias: "BEARISH" },
    risk: {
      entryLow: 99.8,
      entryHigh: 100.2,
      entryReference: entry,
      stopLoss: stop,
      target1,
      target2,
      rr1,
      rr2,
      riskReward: rr2,
      directionalContext: "BEARISH"
    }
  };
  assert.equal(validate(analysis), false);
});


test("buildAlert refuses invalid candidates before formatting a trade alert", () => {
  const start = source.indexOf("function buildAlert(");
  const end = source.indexOf("\n\nasync function fetchWithTimeout", start);

  assert.notEqual(start, -1, "buildAlert() must exist");
  assert.notEqual(end, -1, "buildAlert() boundary must exist");

  const builderSource = source.slice(start, end);
  const context = {
    isTradeCandidate: () => false
  };
  vm.createContext(context);

  const buildAlert = vm.runInContext(
    `${builderSource}\nbuildAlert`,
    context
  );

  assert.throws(
    () => buildAlert({ symbol: "TEST" }, "intraday", {}),
    /Refusing to build trade alert.*candidate validation failed/
  );
});
