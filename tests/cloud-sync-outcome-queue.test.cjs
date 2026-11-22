"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("a History change during an upload triggers a follow-up cloud snapshot", async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "smarttrade-cloud-queue-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  process.env.SIGNAL_HISTORY_FILE = path.join(tempDir, "history.json");
  process.env.GIST_ID = "test-gist";
  process.env.GITHUB_TOKEN = "test-token";

  const cloud = require("../cloud-sync");
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    delete process.env.GIST_ID;
    delete process.env.GITHUB_TOKEN;
    delete process.env.SIGNAL_HISTORY_FILE;
  });

  let releaseFirstGet;
  let markFirstGetStarted;
  const firstGetStarted = new Promise(resolve => {
    markFirstGetStarted = resolve;
  });
  const firstGetGate = new Promise(resolve => {
    releaseFirstGet = resolve;
  });

  let getCount = 0;
  const patches = [];
  let markSecondPatch;
  const secondPatchDone = new Promise(resolve => {
    markSecondPatch = resolve;
  });

  global.fetch = async (_url, options = {}) => {
    if (options.method === "PATCH") {
      const body = JSON.parse(options.body);
      const file = body.files["signal-history.json"];
      patches.push(JSON.parse(file.content));
      if (patches.length === 2) markSecondPatch();
      return { ok: true, json: async () => ({}) };
    }

    getCount++;
    if (getCount === 1) {
      markFirstGetStarted();
      await firstGetGate;
    }

    return {
      ok: true,
      json: async () => ({
        files: {
          "signal-history.json": {
            content: JSON.stringify([
              {
                id: "trade-1",
                status: "ACTIVE",
                outcome: "OPEN",
                updatedAt: "2026-11-01T00:00:00.000Z"
              }
            ])
          }
        }
      })
    };
  };

  cloud.writeHistoryAtomic(process.env.SIGNAL_HISTORY_FILE, [
    {
      id: "trade-1",
      status: "ACTIVE",
      outcome: "OPEN",
      updatedAt: "2026-11-02T00:00:00.000Z"
    }
  ]);

  const firstUpload = cloud.uploadToCloud();
  await firstGetStarted;

  cloud.writeHistoryAtomic(process.env.SIGNAL_HISTORY_FILE, [
    {
      id: "trade-1",
      status: "ACTIVE",
      outcome: "T1_HIT",
      t1HitAt: "2026-11-02T01:00:00.000Z",
      updatedAt: "2026-11-02T01:00:00.000Z"
    }
  ]);

  const queuedUpload = cloud.uploadToCloud();
  releaseFirstGet();

  await Promise.all([firstUpload, queuedUpload]);
  await secondPatchDone;

  assert.equal(patches.length, 2);
  assert.equal(patches[0][0].outcome, "OPEN");
  assert.equal(patches[1][0].outcome, "T1_HIT");
  assert.ok(patches[1][0].t1HitAt);
});
