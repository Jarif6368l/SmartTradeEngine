"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "telegram-watcher.js"), "utf8");

test("automatic watcher market list is restricted to crypto and forex", () => {
  const match = source.match(/const WATCH_MARKETS = \[([\\s\\S]*?)\\n\];/);
  assert.ok(match, "WATCH_MARKETS must be declared");

  const types = [...match[1].matchAll(/type:\\s*"([^"]+)"/g)].map(item => item[1]);
  assert.ok(types.length > 0, "at least one market must be configured");
  assert.ok(types.every(type => type === "crypto" || type === "forex"), "only crypto and forex may be scanned");
  assert.equal(types.filter(type => type === "crypto").length, 7);
  assert.equal(types.filter(type => type === "forex").length, 7);
  assert.doesNotMatch(match[1], /NSE|BSE|stocks|equities/i);
});

test("automatic India/Upstox scan scheduler is removed", () => {
  assert.doesNotMatch(source, /guardedIndiaRun|runUpstoxCycle|India full scan started/);
  assert.match(source, /market\.type === "crypto"[\\s\\S]*market\.type === "forex"/);
});
