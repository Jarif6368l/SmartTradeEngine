const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("telegram-watcher.js", "utf8");

const match = source.match(
  /function normalizeCandles\(raw\) \{[\s\S]*?\n\}(?=\n\nfunction )/
);

if (!match) {
  throw new Error("Could not locate normalizeCandles in telegram-watcher.js");
}

const context = {};
vm.createContext(context);

const normalizeCandles = vm.runInContext(
  `${match[0]}\nnormalizeCandles`,
  context
);

const valid = {
  time: "2026-10-21T10:00:00.000Z",
  open: 100,
  high: 105,
  low: 98,
  close: 103,
  volume: 1000
};

test("valid OHLC candle is retained", () => {
  const result = normalizeCandles([valid]);
  assert.equal(result.length, 1);
  assert.equal(result[0].open, 100);
  assert.equal(result[0].high, 105);
  assert.equal(result[0].low, 98);
  assert.equal(result[0].close, 103);
});

test("candle with high below open is rejected", () => {
  assert.equal(
    normalizeCandles([{ ...valid, high: 99 }]).length,
    0
  );
});

test("candle with high below close is rejected", () => {
  assert.equal(
    normalizeCandles([{ ...valid, high: 102 }]).length,
    0
  );
});

test("candle with low above open is rejected", () => {
  assert.equal(
    normalizeCandles([{ ...valid, low: 101 }]).length,
    0
  );
});

test("candle with low above close is rejected", () => {
  assert.equal(
    normalizeCandles([{ ...valid, low: 104 }]).length,
    0
  );
});

test("zero or negative OHLC prices are rejected", () => {
  for (const field of ["open", "high", "low", "close"]) {
    for (const value of [0, -1]) {
      assert.equal(
        normalizeCandles([{ ...valid, [field]: value }]).length,
        0,
        `${field}=${value} should be rejected`
      );
    }
  }
});

test("invalid candles are discarded without discarding valid candles", () => {
  const result = normalizeCandles([
    valid,
    { ...valid, time: "2026-10-21T10:01:00.000Z", low: 110 }
  ]);

  assert.equal(result.length, 1);
});

test("null candles and missing or blank timestamps are discarded safely", () => {
  assert.doesNotThrow(() => normalizeCandles([null, undefined, valid]));
  assert.equal(normalizeCandles([null, undefined, valid]).length, 1);
  assert.equal(normalizeCandles([{ ...valid, time: "" }]).length, 0);
  assert.equal(normalizeCandles([{ ...valid, time: "   " }]).length, 0);
  assert.equal(normalizeCandles([{ ...valid, time: 0 }]).length, 0);
});

test("non-array input returns an empty result", () => {
  assert.equal(normalizeCandles(null).length, 0);
  assert.equal(normalizeCandles({}).length, 0);
});
