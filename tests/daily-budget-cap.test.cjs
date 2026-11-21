"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "telegram-watcher.js"), "utf8");

test("Twelve Data watcher daily safety budget is fixed at 600", () => {
  assert.match(source, /const DAILY_CREDIT_BUDGET\s*=\s*600\s*;/);
  assert.doesNotMatch(source, /TELEGRAM_WATCH_DAILY_CREDIT_BUDGET/);
});

test("daily watcher budget resets by Asia/Kolkata calendar date", () => {
  assert.match(source, /const today = currentIstDay\(\);[\s\S]{0,220}watcherState\.day !== today/);
  assert.doesNotMatch(source, /watcherState\.day !== new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(source, /TELEGRAM_WATCH_STATE_FILE/);
  assert.match(source, /if \(!saveState\(\)\)[\s\S]{0,180}credit reservation could not be persisted/);
});
