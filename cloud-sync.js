const fs = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, ".signal-history.json");
const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const FILENAME = "signal-history.json";
const REQUEST_TIMEOUT_MS = 15000;

let uploadInProgress = false;

function isCloudSyncConfigured() {
  return Boolean(
    String(process.env.GIST_ID || "").trim() &&
    String(process.env.GITHUB_TOKEN || "").trim()
  );
}

function requestOptions(extra = {}) {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  return {
    ...extra,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(extra.headers || {})
    }
  };
}

function validHistory(value) {
  return Array.isArray(value) &&
    value.every(row => row && typeof row === "object" && !Array.isArray(row));
}

function rowTimestamp(row) {
  const candidates = [row.updatedAt, row.outcomeAt, row.closedAt, row.sentAt];
  for (const value of candidates) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function mergeHistory(localRows, cloudRows) {
  const byId = new Map();
  for (const row of [...cloudRows, ...localRows]) {
    const id = String(row.id || "").trim();
    if (!id) {
      byId.set(`__anonymous_${byId.size}`, row);
      continue;
    }
    const previous = byId.get(id);
    if (!previous || rowTimestamp(row) >= rowTimestamp(previous)) {
      byId.set(id, row);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const at = Date.parse(a.sentAt || "") || 0;
    const bt = Date.parse(b.sentAt || "") || 0;
    return at - bt;
  });
}

function readLocalHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  if (!validHistory(parsed)) throw new Error("Local signal history is not a valid array");
  return parsed;
}

function writeHistoryAtomically(rows) {
  const tempFile = HISTORY_FILE + ".sync.tmp";
  fs.writeFileSync(tempFile, JSON.stringify(rows, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  fs.renameSync(tempFile, HISTORY_FILE);
}

async function downloadFromCloud() {
  const gistId = String(process.env.GIST_ID || "").trim();
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!gistId || !token) {
    console.log("[Cloud Sync] Disabled: GIST_ID or GITHUB_TOKEN is missing.");
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  try {
    const res = await fetch(
      `https://api.github.com/gists/${encodeURIComponent(gistId)}`,
      requestOptions()
    );
    if (!res.ok) {
      throw new Error(`Gist download failed with HTTP ${res.status}`);
    }
    const data = await res.json();
    const file = data.files && data.files[FILENAME];
    if (!file || typeof file.content !== "string") {
      throw new Error(`Gist does not contain ${FILENAME}`);
    }

    const cloudRows = JSON.parse(file.content);
    if (!validHistory(cloudRows)) {
      throw new Error("Cloud signal history is not a valid array");
    }

    const localRows = readLocalHistory();
    const merged = mergeHistory(localRows, cloudRows);
    writeHistoryAtomically(merged);
    console.log(`[Cloud Sync] Restored/merged ${merged.length} signals (${localRows.length} local, ${cloudRows.length} cloud).`);
    return { ok: true, count: merged.length, localCount: localRows.length, cloudCount: cloudRows.length };
  } catch (error) {
    console.error("[Cloud Sync] Download/restore failed:", error.message);
    return { ok: false, error: error.message };
  }
}

async function uploadToCloud() {
  const gistId = String(process.env.GIST_ID || "").trim();
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!gistId || !token) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (uploadInProgress) {
    return { ok: false, skipped: true, reason: "upload_in_progress" };
  }

  uploadInProgress = true;
  try {
    const rows = readLocalHistory();
    const res = await fetch(
      `https://api.github.com/gists/${encodeURIComponent(gistId)}`,
      requestOptions({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: { [FILENAME]: { content: JSON.stringify(rows, null, 2) } }
        })
      })
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gist upload failed with HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    console.log(`[Cloud Sync] Uploaded ${rows.length} signals successfully.`);
    return { ok: true, count: rows.length };
  } catch (error) {
    console.error("[Cloud Sync] Upload failed:", error.message);
    return { ok: false, error: error.message };
  } finally {
    uploadInProgress = false;
  }
}

module.exports = {
  downloadFromCloud,
  uploadToCloud,
  isCloudSyncConfigured,
  mergeHistory,
  writeHistoryAtomically
};
