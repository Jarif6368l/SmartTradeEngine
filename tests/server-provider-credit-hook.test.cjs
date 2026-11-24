"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("server.js", "utf8");

test("watcher credit reservation is not referenced by the OECD helper", () => {
  const start = source.indexOf("async function fetchOecdCsvSeries(");
  assert.notEqual(start, -1, "OECD helper must exist");
  const next = source.indexOf("\n\nasync function ", start + 1);
  const helper = source.slice(start, next === -1 ? source.length : next);
  assert.doesNotMatch(helper, /options\\.beforeProviderRequest/);
});

test("Twelve Data candle fetch reserves watcher credit only after a cache miss", () => {
  const start = source.indexOf("async function fetchTwelveCandles(");
  assert.notEqual(start, -1, "Twelve Data candle helper must exist");
  const next = source.indexOf("\n\nfunction ", start + 1);
  const helper = source.slice(start, next === -1 ? source.length : next);

  const cacheHit = helper.indexOf('source:\n        "CACHE"');
  const reservation = helper.indexOf("options.beforeProviderRequest()");
  const providerRequest = helper.indexOf('"https://api.twelvedata.com/time_series?"');

  assert.notEqual(cacheHit, -1, "cache-hit return must exist");
  assert.notEqual(reservation, -1, "watcher reservation callback must be invoked");
  assert.notEqual(providerRequest, -1, "Twelve Data provider request must exist");
  assert.ok(cacheHit < reservation, "cache hits must return without consuming watcher credits");
  assert.ok(reservation < providerRequest, "credit must be reserved before the provider request");
});
