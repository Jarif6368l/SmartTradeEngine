"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("telegram-watcher.js", "utf8");

test("provider quota exhaustion is persisted and blocks watcher budget availability", () => {
  assert.match(source, /providerQuotaExhaustedDay: null/);
  assert.match(
    source,
    /watcherState\.providerQuotaExhaustedDay !== currentIstDay\(\)/
  );
  assert.match(
    source,
    /watcherState\.providerQuotaExhaustedDay = currentIstDay\(\)/
  );
  assert.match(
    source,
    /run out of api credits\|current limit being\|daily\.\*credit limit\|credits for the day/i
  );
});

test("provider quota pause is cleared only by the next India calendar-day reset", () => {
  const resetStart = source.indexOf("function resetDailyBudgetIfNeeded()");
  const resetEnd = source.indexOf("\n\nfunction writeStateAtomic", resetStart);
  assert.notEqual(resetStart, -1);
  assert.notEqual(resetEnd, -1);
  const reset = source.slice(resetStart, resetEnd);
  assert.match(reset, /watcherState\.providerQuotaExhaustedDay = null/);
  assert.match(reset, /watcherState\.providerQuotaAlertDay = null/);
  assert.match(reset, /currentIstDay\(\)/);
});

test("scheduler distinguishes provider quota exhaustion from the app's 700-credit cap", () => {
  assert.match(source, /Provider daily quota exhausted — scanning paused until next Asia\/Kolkata day/);
  assert.match(source, /App watcher budget reached/);
});
