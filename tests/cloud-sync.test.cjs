"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "smarttrade-cloud-sync-"));
process.env.SIGNAL_HISTORY_FILE = path.join(tempDir, "history.json");
const cloud = require("../cloud-sync");

test("history validation rejects non-arrays, malformed rows, and duplicate IDs", () => {
  assert.throws(() => cloud.validateHistoryRecords({}), /JSON array/);
  assert.throws(() => cloud.validateHistoryRecords([null]), /Invalid signal history record/);
  assert.throws(() => cloud.validateHistoryRecords([{ id: "" }]), /no valid id/);
  assert.throws(() => cloud.validateHistoryRecords([{ id: "x" }, { id: "x" }]), /Duplicate/);
});

test("history merge preserves distinct records and selects the newest update", () => {
  const local = [
    { id: "a", sentAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", outcome: "OPEN", localOnly: true },
    { id: "b", sentAt: "2026-01-01T00:00:00Z" }
  ];
  const remote = [
    { id: "a", sentAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z", outcome: "SL_HIT" },
    { id: "c", sentAt: "2026-01-04T00:00:00Z" }
  ];
  const merged = cloud.mergeHistoryRecords(local, remote);
  assert.deepEqual(merged.map(row => row.id), ["a", "b", "c"]);
  assert.equal(merged[0].outcome, "SL_HIT");
  assert.equal(merged[0].localOnly, true);
});

test("atomic history writer produces parseable data and rotates the previous generation", () => {
  const first = [{ id: "atomic-1", outcome: "OPEN" }];
  const second = [{ id: "atomic-1", outcome: "SL_HIT" }];
  cloud.writeHistoryAtomic(first);
  cloud.writeHistoryAtomic(second);
  assert.deepEqual(JSON.parse(fs.readFileSync(process.env.SIGNAL_HISTORY_FILE, "utf8")), second);
  assert.deepEqual(JSON.parse(fs.readFileSync(process.env.SIGNAL_HISTORY_FILE + ".prev", "utf8")), first);
  assert.equal(fs.readdirSync(tempDir).some(name => name.endsWith(".tmp")), false);
});
