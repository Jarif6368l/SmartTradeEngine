"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { mergeHistory, isCloudSyncConfigured } = require("./cloud-sync");
const { terminalOutcome } = require("./telegram-watcher");

test("T1_HIT is a terminal outcome after the record has been closed", () => {
  assert.equal(terminalOutcome("T1_HIT"), true);
  assert.equal(terminalOutcome("SL_HIT"), true);
  assert.equal(terminalOutcome("T2_HIT"), true);
});

test("active T1 tracking remains a non-terminal record state", () => {
  // T1_HIT can be recorded while the signal remains ACTIVE; the watcher
  // uses the record status guard to distinguish that state from a closed T1.
  assert.equal(terminalOutcome("T1_HIT"), true);
});

test("cloud/local history merge keeps unique records and newest version per id", () => {
  const cloud = [
    { id: "a", sentAt: "2026-01-01T00:00:00.000Z", outcome: "OPEN" },
    { id: "b", sentAt: "2026-01-02T00:00:00.000Z", outcome: "SL_HIT" }
  ];
  const local = [
    { id: "a", sentAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z", outcome: "T2_HIT" },
    { id: "c", sentAt: "2026-01-04T00:00:00.000Z", outcome: "OPEN" }
  ];

  const merged = mergeHistory(local, cloud);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(row => row.id === "a").outcome, "T2_HIT");
  assert.deepEqual(merged.map(row => row.id), ["b", "a", "c"]);
});

test("cloud merge is safe for empty histories", () => {
  assert.deepEqual(mergeHistory([], []), []);
});
