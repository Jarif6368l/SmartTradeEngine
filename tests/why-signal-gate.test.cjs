const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync("public/app.js", "utf8");

const validatorMatch = app.match(
  /function validStylePlanCandidateLevels\(analysis, risk\) \{[\s\S]*?\n\}/
);
const gateMatch = app.match(
  /function isConfirmedWhySignalCandidate\(analysis\) \{[\s\S]*?\n\}/
);

if (!validatorMatch) throw new Error("Candidate-level validator not found");
if (!gateMatch) throw new Error("Why Signal gate not found");

const context = {};
vm.createContext(context);

const isConfirmed = vm.runInContext(
  `${validatorMatch[0]}\n${gateMatch[0]}\nisConfirmedWhySignalCandidate`,
  context
);

function candidate() {
  return {
    bias: "BULLISH",
    style: { plan: { status: "TRADE-CANDIDATE" } },
    risk: {
      decision: "TRADE-CANDIDATE",
      directionalContext: "BULLISH",
      entryLow: 99,
      entryHigh: 101,
      entryReference: 100,
      stopLoss: 98,
      target1: 103,
      target2: 105,
      rr1: 1.5,
      rr2: 2.5,
      riskReward: 2.5
    }
  };
}

test("confirms only when Risk, Style Plan, and levels all validate", () => {
  assert.equal(isConfirmed(candidate()), true);
});

test("does not confirm WAIT or SKIP Risk decisions", () => {
  for (const decision of ["WAIT", "SKIP"]) {
    const a = candidate();
    a.risk.decision = decision;
    assert.equal(isConfirmed(a), false);
  }
});

test("does not confirm when Style Plan is waiting", () => {
  const a = candidate();
  a.style.plan.status = "WAIT";
  assert.equal(isConfirmed(a), false);
});

test("does not confirm invalid stop-loss levels", () => {
  const a = candidate();
  a.risk.stopLoss = 100;
  assert.equal(isConfirmed(a), false);
});

test("does not confirm missing or malformed levels", () => {
  for (const overrides of [
    { target2: null },
    { entryReference: 102 },
    { rr1: 0 },
    { directionalContext: "NEUTRAL" }
  ]) {
    const a = candidate();
    Object.assign(a.risk, overrides);
    assert.equal(isConfirmed(a), false);
  }
});
