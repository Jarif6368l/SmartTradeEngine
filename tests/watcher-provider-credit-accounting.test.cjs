"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const watcher = fs.readFileSync(path.join(__dirname, "..", "telegram-watcher.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("watcher reserves credit only after the shared server cache misses", () => {
  const cacheHit = server.indexOf('source:\n        "CACHE"');
  const reserveHook = server.indexOf("options.beforeProviderRequest()");
  const providerFetch = server.indexOf('"https://api.twelvedata.com/time_series?"');

  assert.notEqual(cacheHit, -1, "server cache-hit response must be present");
  assert.notEqual(reserveHook, -1, "provider reservation hook must be present");
  assert.notEqual(providerFetch, -1, "Twelve Data provider request must be present");
  assert.ok(cacheHit < reserveHook, "cache hits must return before reserving credits");
  assert.ok(reserveHook < providerFetch, "credit must be reserved immediately before provider I/O");
  assert.match(watcher, /beforeProviderRequest:\s*spendCredit/);
});

test("watcher callback is passed through the shared single-flight request", () => {
  assert.match(server, /async function fetchMarketCandles\([\s\S]*?options = \{\}[\s\S]*?\)\s*\{[\s\S]*?fetchTwelveCandles\([\s\S]*?outputsize,[\s\S]*?options/);
  assert.match(server, /async function fetchTwelveCandles\([\s\S]*?options = \{\}/);
});
