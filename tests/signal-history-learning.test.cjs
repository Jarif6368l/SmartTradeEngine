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

  history.writeHistoryAtomic(rows);

  const completed = history.computeLearningEvidence();
  assert.equal(completed.sampleCount, 3);
  assert.equal(completed.t1Hit, 2);
  assert.equal(completed.t2Hit, 1);
  assert.equal(completed.slHit, 2);
  assert.equal(completed.t1Rate, 2 / 3);

  const includingOpen = history.computeLearningEvidence({
    excludeOpen: false
  });
  assert.equal(includingOpen.sampleCount, 4);
  assert.equal(includingOpen.t1Hit, 3);
});

test("legacy TP2 rows count as having passed TP1 even without a T1 timestamp", () => {
  history.writeHistoryAtomic([
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
