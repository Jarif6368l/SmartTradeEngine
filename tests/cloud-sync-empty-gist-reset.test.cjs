"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "smarttrade-empty-gist-reset-"));
const historyFile = path.join(tempDir, "history.json");
process.env.SIGNAL_HISTORY_FILE = historyFile;
process.env.GIST_ID = "test-gist-id";
process.env.GITHUB_TOKEN = "test-token";

let gist = {
  files: {
    "signal-history.json": { content: "[]" }
  }
};
const requests = [];
global.fetch = async (url, options = {}) => {
  requests.push({ method: options.method || "GET", url });
  if (!options.method || options.method === "GET") {
    return {
      ok: true,
      json: async () => JSON.parse(JSON.stringify(gist))
    };
  }
  if (options.method === "PATCH") {
    const body = JSON.parse(options.body);
    for (const [name, file] of Object.entries(body.files || {})) {
      gist.files[name] = { content: file.content };
    }
    return { ok: true, json: async () => gist };
  }
  throw new Error("Unexpected request method");
};

const cloud = require("../cloud-sync");

test("new empty Gist clears local history and previous backup exactly once", async () => {
  const oldRows = [{ id: "old-signal", outcome: "SL_HIT" }];
  fs.writeFileSync(historyFile, JSON.stringify(oldRows));
  fs.writeFileSync(historyFile + ".prev", JSON.stringify(oldRows));

  const first = await cloud.downloadFromCloud();
  assert.deepEqual(first, {
    reset: true,
    cleared: 1,
    filename: "signal-history.json"
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(historyFile, "utf8")), []);
  assert.equal(fs.existsSync(historyFile + ".prev"), false);
  assert.ok(gist.files[".signal-history-reset-v1"]);
  assert.equal(requests.filter(request => request.method === "PATCH").length, 1);

  const newRows = [{ id: "new-signal", outcome: "OPEN" }];
  cloud.writeHistoryAtomic(newRows);
  const second = await cloud.downloadFromCloud();

  assert.equal(second.merged, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(historyFile, "utf8")), newRows);
  assert.equal(requests.filter(request => request.method === "PATCH").length, 1);
});

test("empty Gist reset also removes a previous backup when the primary file is absent", async () => {
  // Use a fresh module/Gist marker state for this independent reset scenario.
  const marker = gist.files[".signal-history-reset-v1"];
  delete gist.files[".signal-history-reset-v1"];
  fs.rmSync(historyFile, { force: true });
  fs.writeFileSync(historyFile + ".prev", JSON.stringify([{ id: "backup-only" }]));

  const result = await cloud.downloadFromCloud();
  assert.equal(result.reset, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(historyFile, "utf8")), []);
  assert.equal(fs.existsSync(historyFile + ".prev"), false);
  gist.files[".signal-history-reset-v1"] = marker;
});
