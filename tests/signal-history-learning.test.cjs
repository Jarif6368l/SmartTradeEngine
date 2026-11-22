"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "smarttrade-learning-"));
process.env.SIGNAL_HISTORY_FILE = path.join(tempDir, "history.json");

const history = require("../signal-history");

test("learning evidence counts TP1 milestones even when the final outcome is SL", () => {
  const rows = [
    {
      id: "sl-after-t1",
      status: "INACTIVE",
      outcome: "SL_HIT",
      t1HitAt: "2026-11-01T01:00:00.000Z",
      slHitAt: "2026-11-01T02:00:00.000Z",
      outcomeR: null
    },
    {
      id: "t2",
      status: "INACTIVE",
      outcome: "T2_HIT",
      t1HitAt: "2026-11-02T01:00:00.000Z",
      t2HitAt: "2026-11-02T02:00:00.000Z",
      outcomeR: 2
    },
    {
      id: "sl-no-t1",
      status: "INACTIVE",
      outcome: "SL_HIT",
      t1HitAt: null,
      slHitAt: "2026-11-03T02:00:00.000Z",
      outcomeR: -1
    },
    {
      id: "active-t1",
      status: "ACTIVE",
      outcome: "T1_HIT",
      t1HitAt: "2026-11-04T01:00:00.000Z"
    }
  ];

  history.writeHistoryAtomic(process.env.SIGNAL_HISTORY_FILE, rows);

  const completed = history.computeLearningEvidence();
  assert.equal(completed.sampleCount, 3);
  assert.equal(completed.t1Hit, 2);
  assert.equal(completed.t2Hit, 1);
  assert.equal(completed.slHit, 2);
  assert.equal(completed.t1Rate, 0.6667);

  const includingOpen = history.computeLearningEvidence({
    excludeOpen: false
  });
  assert.equal(includingOpen.sampleCount, 4);
  assert.equal(includingOpen.t1Hit, 3);
});

test("lifetime stats expose every terminal outcome, including expired and replaced setups", () => {
  history.writeHistoryAtomic(process.env.SIGNAL_HISTORY_FILE, [
    { id: "active", status: "ACTIVE", outcome: "OPEN" },
    { id: "tp2", status: "INACTIVE", outcome: "T2_HIT" },
    { id: "sl", status: "INACTIVE", outcome: "SL_HIT" },
    { id: "invalid", status: "INACTIVE", outcome: "INVALIDATED" },
    { id: "ambiguous", status: "INACTIVE", outcome: "AMBIGUOUS" },
    { id: "expired", status: "INACTIVE", outcome: "EXPIRED" },
    { id: "style", status: "INACTIVE", outcome: "STYLE_CHANGED" },
    { id: "replaced", status: "INACTIVE", outcome: "SETUP_REPLACED" },
    { id: "sl-after-t1", status: "INACTIVE", outcome: "SL_HIT", t1HitAt: "2026-11-06T01:00:00.000Z" }
  ]);

  const summary = history.getSignalHistoryStats().summary;
  assert.equal(summary.total, 9);
  assert.equal(summary.active, 1);
  // T2_HIT also implies TP1 for legacy rows without a stored t1HitAt timestamp.
  assert.equal(summary.t1Touched, 2);
  assert.equal(summary.t2Hit, 1);
  assert.equal(summary.slHit, 2);
  assert.equal(summary.invalidated, 1);
  assert.equal(summary.ambiguous, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.styleChanged, 1);
  assert.equal(summary.setupReplaced, 1);

  const terminalTotal = summary.t2Hit + summary.slHit + summary.invalidated +
    summary.ambiguous + summary.expired + summary.styleChanged + summary.setupReplaced;
  assert.equal(summary.active + terminalTotal, summary.total);
});


test("lifetime statistics separate direct SL from SL after TP1", () => {
  history.writeHistoryAtomic(process.env.SIGNAL_HISTORY_FILE, [
    { id: "direct-sl", status: "INACTIVE", outcome: "SL_HIT", slHitAt: "2026-11-07T01:00:00.000Z", t1HitAt: null },
    { id: "sl-after-t1", status: "INACTIVE", outcome: "SL_HIT", slHitAt: "2026-11-07T02:00:00.000Z", t1HitAt: "2026-11-07T01:30:00.000Z" },
    { id: "tp2", status: "INACTIVE", outcome: "T2_HIT", t1HitAt: "2026-11-07T03:00:00.000Z", t2HitAt: "2026-11-07T04:00:00.000Z" },
    { id: "active", status: "ACTIVE", outcome: "OPEN" }
  ]);

  const summary = history.getSignalHistoryStats().summary;
  assert.equal(summary.total, 4);
  assert.equal(summary.active, 1);
  assert.equal(summary.t1Touched, 2);
  assert.equal(summary.t2Hit, 1);
  assert.equal(summary.slHit, 1);
  assert.equal(summary.slAfterT1, 1);

  const terminalTotal = summary.t2Hit + summary.slHit + summary.slAfterT1;
  assert.equal(summary.active + terminalTotal, summary.total);
});

test("legacy TP2 rows count as having passed TP1 even without a T1 timestamp", () => {
  history.writeHistoryAtomic(process.env.SIGNAL_HISTORY_FILE, [
    {
      id: "legacy-t2",
      status: "INACTIVE",
      outcome: "T2_HIT",
      t1HitAt: null,
      t2HitAt: "2026-11-05T02:00:00.000Z"
    }
  ]);

  const result = history.computeLearningEvidence();
  assert.equal(result.t1Hit, 1);
  assert.equal(result.t2Hit, 1);
});
