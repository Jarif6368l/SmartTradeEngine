const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "public", "app.js");
const app = fs.readFileSync(appPath, "utf8");

test("Style Plan displays the Risk Engine's authoritative trade levels", () => {
  // Match the populated assignment, not the default placeholder.
  const match = /tradePlan\s*=\s*`ENTRY ZONE:/.exec(app);

  assert.ok(
    match,
    "Could not find the populated Style Plan tradePlan assignment"
  );

  const openingTick = app.indexOf("`", match.index);
  const endMarker = "risk.rr2";
  const end = app.indexOf(endMarker, openingTick);

  assert.notEqual(
    end,
    -1,
    "Could not find the final Style Plan R:R expression"
  );

  const template = app.slice(openingTick, end + endMarker.length);

  for (const field of [
    "risk.entryLow",
    "risk.entryHigh",
    "risk.stopLoss",
    "risk.target1",
    "risk.target2",
    "risk.rr1",
    "risk.rr2"
  ]) {
    assert.ok(
      template.includes(field),
      `Style Plan must display ${field}`
    );
  }

  for (const field of [
    "plan.entryLow",
    "plan.entryHigh",
    "plan.stop",
    "plan.target1",
    "plan.target2",
    "plan.rr1",
    "plan.rr2"
  ]) {
    assert.ok(
      !template.includes(field),
      `Style Plan must not independently display ${field}`
    );
  }
});
