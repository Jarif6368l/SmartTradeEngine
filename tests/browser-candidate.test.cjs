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
