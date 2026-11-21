"use strict";

const DAILY_CREDIT_BUDGET = 600;

function istDayFor(timestamp = Date.now()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("Invalid timestamp for Twelve Data budget");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("Twelve Data budget state must be an object");
  }
  const used = Number(state.watcherCredits);
  state.watcherCredits = Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
  return state;
}

function rolloverIfNeeded(state, now = Date.now()) {
  normalizeState(state);
  const today = istDayFor(now);
  let changed = false;

  if (state.day !== today) {
    const lastCreditMs = Date.parse(state.lastCreditAt || "");
    // On first upgrade from the older UTC-based counter, preserve the
    // accumulated count once; subsequent resets use the last-credit IST day.
    if (Number.isFinite(lastCreditMs) && istDayFor(lastCreditMs) !== today) {
      state.watcherCredits = 0;
    }
    state.day = today;
    changed = true;
  }
  return changed;
}

function getBudgetStatus(state, now = Date.now()) {
  rolloverIfNeeded(state, now);
  const used = state.watcherCredits;
  return {
    day: state.day,
    used,
    limit: DAILY_CREDIT_BUDGET,
    remaining: Math.max(0, DAILY_CREDIT_BUDGET - used),
    exhausted: used >= DAILY_CREDIT_BUDGET
  };
}

function reserveCredit(state, now = Date.now()) {
  rolloverIfNeeded(state, now);
  if (state.watcherCredits >= DAILY_CREDIT_BUDGET) {
    const error = new Error("Twelve Data daily application credit cap reached (600/600)");
    error.code = "TWELVE_DATA_DAILY_BUDGET_EXHAUSTED";
    throw error;
  }
  state.watcherCredits += 1;
  state.lastCreditAt = new Date(now).toISOString();
  return getBudgetStatus(state, now);
}

module.exports = {
  DAILY_CREDIT_BUDGET,
  istDayFor,
  getBudgetStatus,
  reserveCredit,
  rolloverIfNeeded
};
