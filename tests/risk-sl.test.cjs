const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/risk.js", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);

const RiskEngine = context.window.RiskEngine;

function decision(overrides = {}, maxSlAtr = 3) {
  context.window.MAX_SL_ATR = maxSlAtr;
  const engine = new RiskEngine();
  const r = {
    directionalContext: "BULLISH",
    currentPrice: 100,
    entryReference: 100,
    stopLoss: 98,
    riskDistance: 2,
    atr: 1,
    riskReward: 2,
    setupQuality: 80,
    decision: "WAIT",
    entryStatus: "WAIT",
    reason: "",
    ...overrides
  };
  engine.determineDecision({ executionState: "READY" }, r);
  return r;
}

test("valid bullish setup remains a candidate", () => {
  assert.equal(decision().decision, "TRADE-CANDIDATE");
});

test("wide SL is skipped", () => {
  const r = decision({ riskDistance: 4, stopLoss: 96 });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /Stop Loss too wide/);
});

test("invalid ATR is skipped", () => {
  const r = decision({ atr: NaN });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /ATR is invalid/);
});

test("invalid limit is skipped rather than bypassing filter", () => {
  assert.equal(decision({}, "not-a-number").decision, "SKIP");
  assert.equal(decision({}, 0).decision, "SKIP");
});

test("SL on wrong side of entry is skipped", () => {
  const r = decision({ stopLoss: 101, riskDistance: 1 });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /wrong side/);
});

test("inconsistent risk distance is skipped", () => {
  const r = decision({ riskDistance: 1 });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /inconsistent/);
});

test("valid bearish setup remains a candidate", () => {
  const r = decision({
    directionalContext: "BEARISH",
    entryReference: 100,
    stopLoss: 102,
    riskDistance: 2
  });
  assert.equal(r.decision, "TRADE-CANDIDATE");
});

test("bearish wide SL is skipped", () => {
  const r = decision({
    directionalContext: "BEARISH",
    entryReference: 100,
    stopLoss: 104,
    riskDistance: 4
  });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /Stop Loss too wide/);
});


test("invalid SL is rejected even when MTF says WAIT", () => {
  context.window.MAX_SL_ATR = 3;
  const engine = new RiskEngine();
  const r = {
    directionalContext: "BULLISH",
    currentPrice: 100,
    entryReference: 100,
    stopLoss: 96,
    riskDistance: 4,
    atr: 1,
    riskReward: 2,
    setupQuality: 80,
    decision: "WAIT",
    entryStatus: "WAIT",
    reason: ""
  };
  engine.determineDecision({ executionState: "WAIT: confirmation" }, r);
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /Stop Loss too wide/);
});

test("valid SL keeps the original MTF WAIT decision", () => {
  context.window.MAX_SL_ATR = 3;
  const engine = new RiskEngine();
  const r = {
    directionalContext: "BULLISH",
    currentPrice: 100,
    entryReference: 100,
    stopLoss: 98,
    riskDistance: 2,
    atr: 1,
    riskReward: 2,
    setupQuality: 80,
    decision: "WAIT",
    entryStatus: "WAIT",
    reason: ""
  };
  engine.determineDecision({ executionState: "WAIT: confirmation" }, r);
  assert.equal(r.decision, "WAIT");
  assert.equal(r.reason, "WAIT: confirmation");
});

// Full analyze() integration tests using deterministic synthetic candles.
function analyzeSyntheticBullishSetup(lastSwingLow) {
  context.window.MAX_SL_ATR = 3;

  const candles = [];
  let close = 100;

  for (let i = 0; i < 30; i++) {
    const next = close + 0.15;
    candles.push({
      open: close,
      high: next + 0.5,
      low: close - 0.5,
      close: next,
      volume: 1000
    });
    close = next;
  }

  const structure = {
    trend: "BULLISH",
    lastSwingLow,
    lastSwingHigh: 105,
    support: 95,
    resistance: 120
  };

  const mtf = {
    mode: "scalping",
    executionState: "BULLISH CONDITIONS ALIGNED",
    confidence: "STRONG",
    oneHour: { structure: "BULLISH" }
  };

  return new RiskEngine().analyze(
    candles,
    structure,
    { momentum: "BULLISH" },
    {
      bullishScore: 80,
      bearishScore: 20,
      confluenceGrade: "STRONG"
    },
    mtf
  );
}

test("full analyze pipeline skips a structurally wide SL", () => {
  const r = analyzeSyntheticBullishSetup(90);

  assert.ok(Number.isFinite(r.atr) && r.atr > 0);
  assert.ok(r.riskDistance / r.atr > 3);
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /Stop Loss too wide/);
  assert.ok(r.stopLoss < r.entryReference);
});

test("full analyze pipeline preserves a valid structural SL candidate", () => {
  const r = analyzeSyntheticBullishSetup(103.8);

  assert.ok(Number.isFinite(r.atr) && r.atr > 0);
  assert.ok(r.riskDistance / r.atr <= 3);
  assert.equal(r.decision, "TRADE-CANDIDATE");
  assert.equal(r.rr1, 1.5);
  assert.equal(r.rr2, 2.5);
  assert.ok(r.stopLoss < r.entryReference);
});
