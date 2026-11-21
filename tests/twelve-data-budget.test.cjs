"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DAILY_CREDIT_BUDGET,
  istDayFor,
  getBudgetStatus,
  reserveCredit,
  rolloverIfNeeded
} = require("../twelve-data-budget");

test("the application-wide Twelve Data budget is fixed at exactly 600", () => {
  assert.equal(DAILY_CREDIT_BUDGET, 600);
});

test("reserving the 600th credit succeeds and the 601st request is blocked", () => {
  const now = Date.parse("2026-11-21T12:00:00.000Z");
  const state = {
    day: istDayFor(now),
    watcherCredits: 599,
    lastCreditAt: new Date(now - 1000).toISOString()
  };

  const last = reserveCredit(state, now);
  assert.equal(last.used, 600);
  assert.equal(last.remaining, 0);
  assert.equal(last.exhausted, true);
  assert.throws(
    () => reserveCredit(state, now + 1000),
    error => error.code === "TWELVE_DATA_DAILY_BUDGET_EXHAUSTED"
  );
  assert.equal(state.watcherCredits, 600);
});

test("daily rollover follows the IST calendar boundary", () => {
  const beforeMidnight = Date.parse("2026-11-21T17:59:00.000Z"); // 23:29 IST
  const afterMidnight = Date.parse("2026-11-21T18:31:00.000Z"); // 00:01 IST next day
  const state = {
    day: istDayFor(beforeMidnight),
    watcherCredits: 600,
    lastCreditAt: new Date(beforeMidnight).toISOString()
  };

  assert.equal(rolloverIfNeeded(state, afterMidnight), true);
  assert.equal(state.day, istDayFor(afterMidnight));
  assert.equal(state.watcherCredits, 0);
  assert.equal(getBudgetStatus(state, afterMidnight).remaining, 600);
});

test("migration from the older UTC counter preserves usage once instead of granting a fresh allowance", () => {
  const now = Date.parse("2026-11-21T18:31:00.000Z");
  const state = {
    day: "2026-11-21",
    watcherCredits: 487
  };

  rolloverIfNeeded(state, now);
  assert.equal(state.day, istDayFor(now));
  assert.equal(state.watcherCredits, 487);
  assert.equal(getBudgetStatus(state, now).remaining, 113);
});

test("the counter cannot be reset by changing the Twelve Data API key", () => {
  const now = Date.parse("2026-11-21T12:00:00.000Z");
  const state = {
    day: istDayFor(now),
    watcherCredits: 250,
    keyHash: "old-key",
    lastCreditAt: new Date(now - 1000).toISOString()
  };

  state.keyHash = "new-key";
  assert.equal(getBudgetStatus(state, now).used, 250);
});
