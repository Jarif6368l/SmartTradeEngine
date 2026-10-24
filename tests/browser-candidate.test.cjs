const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync("public/app.js", "utf8");
const match = app.match(
  /function validStylePlanCandidateLevels\(analysis, risk\) \{[\s\S]*?\n\}/
);

if (!match) throw new Error("Browser candidate validator not found");

const context = {};
vm.createContext(context);
const validate = vm.runInContext(
  `${match[0]}\nvalidStylePlanCandidateLevels`,
  context
);

function bullish(overrides = {}) {
  return {
    bias: "BULLISH",
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
    bias: "BEARISH",
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

test("accepts valid bullish levels and matching R:R", () => {
  const a = bullish();
  assert.equal(validate(a, a.risk), true);
});

test("accepts valid bearish levels and matching R:R", () => {
  const a = bearish();
  assert.equal(validate(a, a.risk), true);
});

test("rejects missing, non-finite, zero or negative levels", () => {
  for (const overrides of [
    { entryLow: NaN },
    { entryHigh: 0 },
    { entryReference: "" },
    { stopLoss: -1 },
    { target1: Infinity },
    { target2: null },
    { rr1: NaN },
    { rr2: 0 }
  ]) {
    const a = bullish(overrides);
    assert.equal(validate(a, a.risk), false);
  }
});

test("rejects invalid entry zone and reference outside zone", () => {
  for (const overrides of [
    { entryLow: 102, entryHigh: 101 },
    { entryReference: 102 }
  ]) {
    const a = bullish(overrides);
    assert.equal(validate(a, a.risk), false);
  }
});

test("rejects stop loss and target ordering that conflicts with direction", () => {
  for (const [factory, overrides] of [
    [bullish, { stopLoss: 100 }],
    [bullish, { target2: 102 }],
    [bearish, { stopLoss: 100 }],
    [bearish, { target2: 98 }]
  ]) {
    const a = factory(overrides);
    assert.equal(validate(a, a.risk), false);
  }
});

test("rejects Style and Risk direction conflicts", () => {
  const a = bullish({ directionalContext: "BEARISH" });
  assert.equal(validate(a, a.risk), false);
});

test("rejects neutral or unknown Risk direction", () => {
  for (const direction of [
    "NEUTRAL / CONFLICTED",
    "NO CLEAN DIRECTION",
    "",
    "UNKNOWN",
    "BULLISH / BEARISH CONFLICT"
  ]) {
    const a = bullish({ directionalContext: direction });
    assert.equal(validate(a, a.risk), false);
  }
});

test("accepts matching unconfirmed directional Risk context", () => {
  for (const direction of [
    "BULLISH — UNCONFIRMED"
  ]) {
    const a = bullish({ directionalContext: direction });
    assert.equal(validate(a, a.risk), true);
  }

  const a = bearish({
    directionalContext: "BEARISH — UNCONFIRMED"
  });
  assert.equal(validate(a, a.risk), true);
});


test("rejects malformed substring directions", () => {
  const a = bullish({ directionalContext: "NOT BULLISH" });
  assert.equal(validate(a, a.risk), false);

  const b = bullish();
  b.bias = "NOT BULLISH";
  assert.equal(validate(b, b.risk), false);
});

test("rejects unclear Style direction", () => {
  const a = bullish();
  a.bias = "NEUTRAL";
  assert.equal(validate(a, a.risk), false);
});

test("rejects T1 below 1.5R", () => {
  const a = bullish({ target1: 102.9, rr1: 1.45 });
  assert.equal(validate(a, a.risk), false);
});

test("rejects reported R:R inconsistent with actual prices", () => {
  const a = bullish({ rr1: 2 });
  assert.equal(validate(a, a.risk), false);

  const b = bearish({ rr2: 3 });
  assert.equal(validate(b, b.risk), false);
});

test("rejects missing or inconsistent overall risk/reward", () => {
  const missing = bullish({ riskReward: undefined });
  assert.equal(validate(missing, missing.risk), false);

  const bullishMismatch = bullish({ riskReward: 3 });
  assert.equal(validate(bullishMismatch, bullishMismatch.risk), false);

  const bearishMismatch = bearish({ riskReward: 1.5 });
  assert.equal(validate(bearishMismatch, bearishMismatch.risk), false);
});

test("Style Plan details use the same validated display status", () => {
  assert.match(
    app,
    /SETUP STATUS\\n` \+\s*`\$\{displayStatus\}\\n\\n` \+/
  );
});

test("invalid levels show a dedicated WAIT status", () => {
  assert.match(
    app,
    /!levelsValid\s*\? "WAIT — LEVEL VALIDATION FAILED"/
  );
});

test("candidate display gate requires validated levels", () => {
  assert.match(
    app,
    /risk\.decision === "TRADE-CANDIDATE" &&\s*levelsValid/
  );
});


test("accepts mathematically 1.5R when floating-point subtraction is slightly low", () => {
  const entry = 61.71967708970946;
  const stop = 61.70918992627398;
  const risk = entry - stop;
  const target1 = 61.73540783486267;
  const target2 = 61.745894998298155;
  const rr2 = (target2 - entry) / risk;
  const analysis = {
    bias: "BULLISH",
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
  assert.equal(validate(analysis, analysis.risk), true);
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
    bias: "BULLISH",
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
  assert.equal(validate(analysis, analysis.risk), false);
});


test("accepts bearish mathematically 1.5R when floating-point subtraction is slightly low", () => {
  const entry = 0.3003194018075712;
  const stop = 0.32660350429266444;
  const risk = stop - entry;
  const target1 = 0.2608932480799314;
  const target2 = entry - risk * 2.5;
  const rr2 = (entry - target2) / risk;
  const analysis = {
    bias: "BEARISH",
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
  assert.equal(validate(analysis, analysis.risk), true);
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
    bias: "BEARISH",
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
  assert.equal(validate(analysis, analysis.risk), false);
});
