"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("telegram-watcher.js", "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);

  if (start < 0) {
    throw new Error(`Cannot find function ${name}`);
  }

  const next = source.indexOf("\n\nfunction ", start + 1);
  const end = next < 0 ? source.length : next;

  return source.slice(start, end).trim();
}

const extracted = [
  "candleTimeMs",
  "shouldEvaluateOutcomeCandle",
  "terminalOutcome",
  "calculateTheoreticalMaxR",
  "isAmbiguousOutcomeCandle",
  "trackSignalOutcome"
].map(extractFunction).join("\n\n");

const INTERVAL = 15 * 60 * 1000;
const SENT_MS = Date.parse("2026-10-20T00:00:00.000Z");

function makeHarness(options = {}) {
  const clock = {
    now: options.now ?? SENT_MS + 24 * 60 * 60 * 1000
  };

  const RealDate = Date;

  class FixedDate extends RealDate {
    static now() {
      return clock.now;
    }
  }

  const record = {
    id: "outcome-test",
    status: "ACTIVE",
    outcome: "OPEN",
    sentAt: new RealDate(SENT_MS).toISOString(),
    direction: "BULLISH",
    mode: "intraday",
    symbol: "TEST",
    marketType: "crypto",
    exchange: "",
    entryReference: 100,
    stopLoss: 95,
    target1: 105,
    target2: 110,
    rr2: 2,
    maxRReached: 0,
    highestPriceSeen: null,
    lowestPriceSeen: null,
    ...(options.record || {})
  };

  let updateCount = 0;

  const context = {
    Date: FixedDate,

    getSignalHistoryById(id) {
      return id === record.id ? record : null;
    },

    updateSignalHistory(id, patch) {
      if (id !== record.id) return null;
      updateCount++;
      Object.assign(record, patch);
      return { ...record };
    },

    notifyDemoOutcome() {},

    deriveSlReason() {
      return "Regression test";
    }
  };

  vm.createContext(context);
  vm.runInContext(extracted, context);

  return {
    record,
    clock,
    track(frames) {
      return context.trackSignalOutcome(frames, record.id);
    },
    get updateCount() {
      return updateCount;
    }
  };
}

function candle(openMs, high, low) {
  return {
    time: new Date(openMs).toISOString(),
    open: 100,
    high,
    low,
    close: 100
  };
}

function m15(...candles) {
  return { m15: candles, h1: [] };
}

test("pre-signal and not-yet-closed candles are ignored", () => {
  const harness = makeHarness({
    now: SENT_MS + 20 * 60 * 1000
  });

  const result = harness.track(m15(
    candle(SENT_MS - INTERVAL, 120, 80),
    candle(SENT_MS + INTERVAL, 120, 80)
  ));

  assert.equal(result.outcome, "OPEN");
  assert.equal(result.status, "ACTIVE");
  assert.equal(harness.updateCount, 0);
});

test("SL and T1 touched in one candle become AMBIGUOUS", () => {
  const harness = makeHarness();

  const result = harness.track(m15(
    candle(SENT_MS + INTERVAL, 106, 94)
  ));

  assert.equal(result.outcome, "AMBIGUOUS");
  assert.equal(result.status, "INACTIVE");
  assert.equal(result.outcomeR, null);
  assert.equal(result.outcomeTrackingMethod,
    "CLOSED_CANDLE_CONFIRMATION");
  assert.equal(harness.updateCount, 1);
});

test("T1 followed by SL preserves T1 and leaves outcomeR unknown", () => {
  const harness = makeHarness();

  const result = harness.track(m15(
    candle(SENT_MS + INTERVAL, 106, 99),
    candle(SENT_MS + 2 * INTERVAL, 102, 94)
  ));

  assert.equal(result.outcome, "SL_HIT");
  assert.equal(result.status, "INACTIVE");
  assert.ok(result.t1HitAt, "earlier T1 touch should be preserved");
  assert.ok(result.slHitAt, "SL touch timestamp should be recorded");
  assert.equal(result.outcomeR, null);
  assert.match(result.closedReason, /after Target 1/i);
});

test("T2 records planned R and terminal result is not overwritten", () => {
  const harness = makeHarness();

  const result = harness.track(m15(
    candle(SENT_MS + INTERVAL, 111, 99)
  ));

  assert.equal(result.outcome, "T2_HIT");
  assert.equal(result.status, "INACTIVE");
  assert.equal(result.outcomeR, 2);
  assert.ok(result.t2HitAt);

  const updatesAfterT2 = harness.updateCount;

  const repeated = harness.track(m15(
    candle(SENT_MS + INTERVAL, 120, 80),
    candle(SENT_MS + 2 * INTERVAL, 120, 80)
  ));

  assert.equal(repeated.outcome, "T2_HIT");
  assert.equal(repeated.outcomeR, 2);
  assert.equal(harness.updateCount, updatesAfterT2);
});

test("saved T1 is restored before a later candle is evaluated", () => {
  const savedT1At = new Date(
    SENT_MS + 2 * INTERVAL
  ).toISOString();

  const harness = makeHarness({
    record: { t1HitAt: savedT1At }
  });

  const result = harness.track(m15(
    candle(SENT_MS + 3 * INTERVAL, 102, 94)
  ));

  assert.equal(result.outcome, "SL_HIT");
  assert.equal(result.t1HitAt, savedT1At);
  assert.equal(result.outcomeR, null);
});


test("bearish T1 followed by SL preserves the earlier T1", () => {
  const harness = makeHarness({
    record: {
      direction: "BEARISH",
      stopLoss: 105,
      target1: 95,
      target2: 90,
      rr2: 2
    }
  });

  const result = harness.track(m15(
    candle(SENT_MS + INTERVAL, 101, 94),
    candle(SENT_MS + 2 * INTERVAL, 106, 98)
  ));

  assert.equal(result.outcome, "SL_HIT");
  assert.equal(result.status, "INACTIVE");
  assert.ok(result.t1HitAt, "earlier bearish T1 touch should be preserved");
  assert.ok(result.slHitAt, "bearish SL timestamp should be recorded");
  assert.equal(result.outcomeR, null);
  assert.match(result.closedReason, /after Target 1/i);
});

test("bearish T2 records planned R", () => {
  const harness = makeHarness({
    record: {
      direction: "BEARISH",
      stopLoss: 105,
      target1: 95,
      target2: 90,
      rr2: 2
    }
  });

  const result = harness.track(m15(
    candle(SENT_MS + INTERVAL, 101, 89)
  ));

  assert.equal(result.outcome, "T2_HIT");
  assert.equal(result.status, "INACTIVE");
  assert.equal(result.outcomeR, 2);
  assert.ok(result.t2HitAt);
});

test("bearish SL and T2 in one candle become AMBIGUOUS", () => {
  const harness = makeHarness({
    record: {
      direction: "BEARISH",
      stopLoss: 105,
      target1: 95,
      target2: 90,
      rr2: 2
    }
  });

  const result = harness.track(m15(
    candle(SENT_MS + INTERVAL, 106, 89)
  ));

  assert.equal(result.outcome, "AMBIGUOUS");
  assert.equal(result.status, "INACTIVE");
  assert.equal(result.outcomeR, null);
  assert.equal(result.outcomeTrackingMethod,
    "CLOSED_CANDLE_CONFIRMATION");
});


test("swing mode ignores an hourly candle until it fully closes", () => {
  const hour = 60 * 60 * 1000;
  const harness = makeHarness({
    now: SENT_MS + 90 * 60 * 1000,
    record: { mode: "swing" }
  });

  const result = harness.track({
    m15: [],
    h1: [
      candle(SENT_MS + hour, 104, 99)
    ]
  });

  assert.equal(result.outcome, "OPEN");
  assert.equal(result.status, "ACTIVE");
  assert.equal(harness.updateCount, 0);
});

test("missing candle frames leave outcome unchanged", () => {
  const harness = makeHarness();

  const result = harness.track({ h1: [] });

  assert.equal(result.outcome, "OPEN");
  assert.equal(result.status, "ACTIVE");
  assert.equal(harness.updateCount, 0);
});



test("malformed OHLC candles are ignored for bullish and bearish outcomes", () => {
  const time = SENT_MS + INTERVAL;

  const malformedCandles = [
    candle(time, 94, 96),
    candle(time, 106, 0),
    candle(time, 99, 96),
    { ...candle(time, 106, 99), close: 107 },
    { ...candle(time, 106, 101), open: 102 },
    { ...candle(time, 106, 99), open: undefined },
    { ...candle(time, 106, 99), close: undefined }
  ];

  for (const direction of ["BULLISH", "BEARISH"]) {
    for (const invalidCandle of malformedCandles) {
      const record = direction === "BULLISH"
        ? {}
        : {
            direction: "BEARISH",
            stopLoss: 105,
            target1: 95,
            target2: 90
          };

      const harness = makeHarness({ record });
      const result = harness.track(m15(invalidCandle));

      assert.equal(
        result.outcome,
        "OPEN",
        direction + ": malformed candle must not trigger an outcome"
      );
      assert.equal(result.status, "ACTIVE");
      assert.equal(harness.updateCount, 0);
      assert.equal(result.highestPriceSeen, null);
      assert.equal(result.lowestPriceSeen, null);
      assert.equal(result.maxRReached, 0);
    }
  }
});
