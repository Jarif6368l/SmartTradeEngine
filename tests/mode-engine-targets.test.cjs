const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("public/mode-engine.js", "utf8"),
  context
);

const ModeAnalysisEngine = context.window.ModeAnalysisEngine;

function makePlan(bias, obstacleR) {
  const engine = new ModeAnalysisEngine();
  const candles = Array.from({ length: 40 }, () => ({
    open: 100, high: 101, low: 99, close: 100, volume: 1000
  }));

  const atr = engine.atr(candles);
  assert.ok(Number.isFinite(atr) && atr > 0, "test ATR must be valid");

  const price = 100;
  let structure;
  let referenceEntry;
  let stop;
  let risk;

  if (bias === "BULLISH") {
    referenceEntry = price + atr * 0.04;
    stop = 90 - atr * 0.25;
    risk = referenceEntry - stop;
    structure = {
      lastSwingLow: 90,
      lastSwingHigh: 110,
      support: 95,
      resistance: referenceEntry + risk * obstacleR
    };
  } else {
    referenceEntry = price - atr * 0.04;
    stop = 110 + atr * 0.25;
    risk = stop - referenceEntry;
    structure = {
      lastSwingLow: 90,
      lastSwingHigh: 110,
      resistance: 105,
      support: referenceEntry - risk * obstacleR
    };
  }

  return engine.buildTradePlan({
    bias,
    decision: "TRADE-CANDIDATE",
    reason: "Regression test",
    executionFrame: { candles, structure }
  });
}

for (const bias of ["BULLISH", "BEARISH"]) {
  test(bias + ": exact 1.5R obstacle cannot produce a candidate", () => {
    const plan = makePlan(bias, 1.5);
    assert.equal(plan.status, "SKIP");
    assert.equal(plan.active, false);
    if (Number.isFinite(plan.target1) && Number.isFinite(plan.target2)) {
      if (bias === "BULLISH") assert.ok(plan.target2 > plan.target1);
      else assert.ok(plan.target2 < plan.target1);
    }
  });

  test(bias + ": valid 2R obstacle preserves ordered targets", () => {
    const plan = makePlan(bias, 2);
    assert.equal(plan.status, "TRADE-CANDIDATE");
    assert.equal(plan.active, true);
    if (bias === "BULLISH") {
      assert.ok(plan.target1 > plan.entryHigh);
      assert.ok(plan.target2 > plan.target1);
    } else {
      assert.ok(plan.target1 < plan.entryLow);
      assert.ok(plan.target2 < plan.target1);
    }
    assert.ok(plan.rr1 >= 1.5 - 1e-9);
    assert.ok(plan.rr2 > plan.rr1);
  });
}
