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
    target1: 103,
    target2: 105,
    rr1: 1.5,
    rr2: 2.5,
    riskReward: 2.5,
    setupQuality: 80,
    decision: "WAIT",
    entryStatus: "WAIT",
    reason: "",
    ...overrides
  };
  engine.determineDecision({ executionState: "READY" }, r);
  return r;
}

test("invalidation does not calculate SL from zero or negative ATR", () => {
  const engine = new RiskEngine();

  for (const atr of [0, -1, NaN, Infinity]) {
    const r = {
      directionalContext: "BULLISH",
      currentPrice: 100,
      entryReference: 100,
      atr,
      stopLoss: NaN,
      riskDistance: NaN,
      invalidation: NaN
    };

    engine.calculateInvalidation(
      { lastSwingLow: 95, support: 94 },
      r
    );

    assert.ok(Number.isNaN(r.stopLoss), `stopLoss must remain unset for ATR=${atr}`);
    assert.ok(Number.isNaN(r.riskDistance), `riskDistance must remain unset for ATR=${atr}`);
    assert.ok(Number.isNaN(r.invalidation), `invalidation must remain unset for ATR=${atr}`);
  }
});

test("valid bullish setup remains a candidate", () => {
  assert.equal(decision().decision, "TRADE-CANDIDATE");
});

test("wide but structurally valid SL is not rejected by a removed ATR cap", () => {
  const r = decision({
    riskDistance: 4,
    stopLoss: 96,
    target1: 106,
    target2: 110,
    rr1: 1.5,
    rr2: 2.5,
    riskReward: 2.5
  });
  assert.equal(r.decision, "TRADE-CANDIDATE");
  assert.equal(r.riskDistance, 4);
});

test("missing T2 cannot be promoted to a trade candidate", () => {
  const r = decision({
    target2: NaN,
    rr2: NaN
  });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /target levels/i);
});

test("bullish targets must be strictly ordered", () => {
  const r = decision({
    target1: 103,
    target2: 103,
    rr1: 1.5,
    rr2: 1.5,
    riskReward: 1.5
  });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /target levels/i);
});

test("bearish targets must be strictly ordered", () => {
  const r = decision({
    directionalContext: "BEARISH",
    stopLoss: 102,
    target1: 97,
    target2: 98,
    rr1: 1.5,
    rr2: 1,
    riskReward: 1.5
  });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /target levels/i);
});

test("reported target R:R must match the actual prices", () => {
  const r = decision({ rr2: 3 });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /inconsistent/i);
});

test("reported overall risk/reward must match actual T2 R:R", () => {
  const r = decision({ riskReward: 3 });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /inconsistent/i);
});

test("invalid ATR is skipped", () => {
  const r = decision({ atr: NaN });
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /ATR is invalid/);
});

test("legacy MAX_SL_ATR setting does not override structural validation", () => {
  assert.equal(decision({}, "not-a-number").decision, "TRADE-CANDIDATE");
  assert.equal(decision({}, 0).decision, "TRADE-CANDIDATE");
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
    riskDistance: 2,
    target1: 97,
    target2: 95,
    rr1: 1.5,
    rr2: 2.5,
    riskReward: 2.5
  });
  assert.equal(r.decision, "TRADE-CANDIDATE");
});

test("wide bearish SL is not rejected by a removed ATR cap", () => {
  const r = decision({
    directionalContext: "BEARISH",
    entryReference: 100,
    stopLoss: 104,
    riskDistance: 4,
    target1: 94,
    target2: 90,
    rr1: 1.5,
    rr2: 2.5,
    riskReward: 2.5
  });
  assert.equal(r.decision, "TRADE-CANDIDATE");
  assert.equal(r.riskDistance, 4);
});


test("structurally valid SL preserves MTF WAIT regardless of ATR distance", () => {
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
  assert.equal(r.decision, "WAIT");
  assert.equal(r.reason, "WAIT: confirmation");
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

test("full analyze pipeline skips when resistance blocks T1 for a structurally wide SL", () => {
  const r = analyzeSyntheticBullishSetup(90);

  assert.ok(Number.isFinite(r.atr) && r.atr > 0);
  assert.ok(r.riskDistance / r.atr > 3);
  assert.equal(r.decision, "SKIP");
  assert.match(r.reason, /target levels/i);
  assert.ok(r.stopLoss < r.entryReference);
  assert.ok(Number.isFinite(r.target1));
  assert.ok(!Number.isFinite(r.target2));
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

test("nearby bullish resistance below 1.5R forces SKIP", () => {
  context.window.MAX_SL_ATR = 3;
  const engine = new RiskEngine();

  const r = {
    directionalContext: "BULLISH",
    currentPrice: 100,
    entryReference: 100,
    stopLoss: 98,
    riskDistance: 2,
    atr: 1,
    target1: NaN,
    target2: NaN,
    rr1: NaN,
    rr2: NaN,
    riskReward: NaN,
    setupQuality: 80,
    decision: "WAIT",
    entryStatus: "WAIT",
    reason: ""
  };

  engine.calculateTargets(
    { resistance: 102.5 },
    r
  );

  assert.equal(r.target1, 102.5);
  assert.ok(Number.isNaN(r.target2));
  assert.ok(r.rr1 < 1.5);
  assert.ok(r.riskReward < 1.5);
  assert.match(r.targetLogic, /resistance caps upside/i);

  engine.determineDecision(
    { executionState: "READY" },
    r
  );

  assert.equal(r.decision, "SKIP");
});

test("nearby bearish support below 1.5R forces SKIP", () => {
  context.window.MAX_SL_ATR = 3;
  const engine = new RiskEngine();

  const r = {
    directionalContext: "BEARISH",
    currentPrice: 100,
    entryReference: 100,
    stopLoss: 102,
    riskDistance: 2,
    atr: 1,
    target1: NaN,
    target2: NaN,
    rr1: NaN,
    rr2: NaN,
    riskReward: NaN,
    setupQuality: 80,
    decision: "WAIT",
    entryStatus: "WAIT",
    reason: ""
  };

  engine.calculateTargets(
    { support: 97.5 },
    r
  );

  assert.equal(r.target1, 97.5);
  assert.ok(Number.isNaN(r.target2));
  assert.ok(r.rr1 < 1.5);
  assert.ok(r.riskReward < 1.5);
  assert.match(r.targetLogic, /support caps downside/i);

  engine.determineDecision(
    { executionState: "READY" },
    r
  );

  assert.equal(r.decision, "SKIP");
});

test("structural resistance between 1.5R and 2.5R preserves valid candidate", () => {
  context.window.MAX_SL_ATR = 3;
  const engine = new RiskEngine();

  const r = {
    directionalContext: "BULLISH",
    currentPrice: 100,
    entryReference: 100,
    stopLoss: 98,
    riskDistance: 2,
    atr: 1,
    target1: NaN,
    target2: NaN,
    rr1: NaN,
    rr2: NaN,
    riskReward: NaN,
    setupQuality: 80,
    decision: "WAIT",
    entryStatus: "WAIT",
    reason: ""
  };

  engine.calculateTargets(
    { resistance: 104 },
    r
  );

  assert.equal(r.target1, 103);
  assert.equal(r.target2, 104);
  assert.equal(r.rr1, 1.5);
  assert.equal(r.rr2, 2);
  assert.equal(r.riskReward, 2);

  engine.determineDecision(
    { executionState: "READY" },
    r
  );

  assert.equal(r.decision, "TRADE-CANDIDATE");
});


test("accepts mathematically 1.5R when floating-point subtraction is slightly low", () => {
  const entryReference = 61.71967708970946;
  const stopLoss = 61.70918992627398;
  const riskDistance = entryReference - stopLoss;
  const target1 = 61.73540783486267;
  const target2 = 61.745894998298155;
  const actualRR1 = (target1 - entryReference) / riskDistance;
  const actualRR2 = (target2 - entryReference) / riskDistance;

  assert.ok(actualRR1 < 1.5, `probe should reproduce float error, got ${actualRR1}`);
  assert.ok(actualRR1 > 1.5 - 1e-12);

  const result = decision({
    entryReference,
    currentPrice: entryReference,
    stopLoss,
    riskDistance,
    target1,
    target2,
    rr1: 1.5,
    rr2: actualRR2,
    riskReward: actualRR2
  });

  assert.equal(result.decision, "TRADE-CANDIDATE");
});

test("rejects a genuinely sub-1.5R setup beyond the numeric tolerance", () => {
  const entryReference = 100;
  const stopLoss = 98;
  const riskDistance = entryReference - stopLoss;
  const target1 = entryReference + riskDistance * (1.5 - 1e-9);
  const target2 = entryReference + riskDistance * 2.5;
  const actualRR1 = (target1 - entryReference) / riskDistance;
  const actualRR2 = (target2 - entryReference) / riskDistance;

  const result = decision({
    entryReference,
    currentPrice: entryReference,
    stopLoss,
    riskDistance,
    target1,
    target2,
    rr1: actualRR1,
    rr2: actualRR2,
    riskReward: actualRR2
  });

  assert.ok(actualRR1 < 1.5 - 1e-12);
  assert.equal(result.decision, "SKIP");
});


test("accepts bearish mathematically 1.5R when floating-point subtraction is slightly low", () => {
  const entryReference = 0.3003194018075712;
  const stopLoss = 0.32660350429266444;
  const riskDistance = stopLoss - entryReference;
  const target1 = 0.2608932480799314;
  const target2 = entryReference - riskDistance * 2.5;
  const actualRR1 = (entryReference - target1) / riskDistance;
  const actualRR2 = (entryReference - target2) / riskDistance;

  assert.ok(actualRR1 < 1.5);
  assert.ok(actualRR1 > 1.5 - 1e-12);

  const result = decision({
    directionalContext: "BEARISH",
    entryReference,
    currentPrice: entryReference,
    stopLoss,
    riskDistance,
    target1,
    target2,
    rr1: 1.5,
    rr2: actualRR2,
    riskReward: actualRR2
  });

  assert.equal(result.decision, "TRADE-CANDIDATE");
});

test("rejects genuinely bearish sub-1.5R beyond the numeric tolerance", () => {
  const entryReference = 100;
  const stopLoss = 102;
  const riskDistance = stopLoss - entryReference;
  const target1 = entryReference - riskDistance * (1.5 - 1e-9);
  const target2 = entryReference - riskDistance * 2.5;
  const actualRR1 = (entryReference - target1) / riskDistance;
  const actualRR2 = (entryReference - target2) / riskDistance;

  const result = decision({
    directionalContext: "BEARISH",
    entryReference,
    currentPrice: entryReference,
    stopLoss,
    riskDistance,
    target1,
    target2,
    rr1: actualRR1,
    rr2: actualRR2,
    riskReward: actualRR2
  });

  assert.ok(actualRR1 < 1.5 - 1e-12);
  assert.equal(result.decision, "SKIP");
});
