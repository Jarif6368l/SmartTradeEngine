"use strict";

const fs = require("fs");
const path = require("path");

const HISTORY_FILE = process.env.SIGNAL_HISTORY_FILE
  ? path.resolve(process.env.SIGNAL_HISTORY_FILE)
  : path.join(__dirname, ".signal-history.json");
const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CANONICAL_FILENAME = "signal-history.json";
const LEGACY_FILENAMES = [".signal-history.json"];
const GIST_URL = GIST_ID ? `https://api.github.com/gists/${GIST_ID}` : null;
let downloadInFlight = null;
let uploadInFlight = null;

function validateHistoryRecords(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Signal history backup must be a JSON array");
  }
  const ids = new Set();
  for (let index = 0; index < value.length; index++) {
    const row = value[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError(`Invalid signal history record at index ${index}`);
    }
    if (typeof row.id !== "string" || !row.id.trim()) {
      throw new TypeError(`Signal history record at index ${index} has no valid id`);
    }
    if (ids.has(row.id)) {
      throw new TypeError(`Duplicate signal history id: ${row.id}`);
    }
    ids.add(row.id);
  }
  return value;
}

function recordTime(row) {
  const value = Date.parse(row.updatedAt || row.outcomeAt || row.sentAt || "");
  return Number.isFinite(value) ? value : 0;
}

function mergeHistoryRecords(localRows, remoteRows) {
  validateHistoryRecords(localRows);
  validateHistoryRecords(remoteRows);
  const merged = new Map();
  for (const row of localRows) merged.set(row.id, row);
  for (const row of remoteRows) {
    const local = merged.get(row.id);
    if (!local || recordTime(row) >= recordTime(local)) {
      merged.set(row.id, local ? { ...local, ...row } : row);
    } else if (local) {
      merged.set(row.id, { ...row, ...local });
    }
  }
  return [...merged.values()];
}

function readLocalHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  return validateHistoryRecords(parsed);
}

function writeHistoryAtomic(rows) {
  validateHistoryRecords(rows);
  const directory = path.dirname(HISTORY_FILE);
  fs.mkdirSync(directory, { recursive: true });
  const suffix = `${process.pid}.${Date.now()}`;
  const temp = `${HISTORY_FILE}.${suffix}.tmp`;
  const previous = `${HISTORY_FILE}.prev`;
  const previousTemp = `${previous}.${suffix}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(rows, null, 2), "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;

    // Rotate only a valid current generation; never replace a good backup
    // with a corrupt or partially written primary file.
    if (fs.existsSync(HISTORY_FILE)) {
      const current = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
      validateHistoryRecords(current);
      fs.copyFileSync(HISTORY_FILE, previousTemp);
      fs.renameSync(previousTemp, previous);
    }
    fs.renameSync(temp, HISTORY_FILE);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    for (const candidate of [temp, previousTemp]) {
      try { fs.unlinkSync(candidate); } catch {}
    }
    throw error;
  }
}

function authHeaders(json = false) {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response, operation) {
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.message || "";
    } catch {}
    throw new Error(`${operation} failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}

function chooseGistFile(files) {
  if (files && files[CANONICAL_FILENAME]) return CANONICAL_FILENAME;
  return LEGACY_FILENAMES.find(name => files && files[name]) || null;
}

async function readGistHistory(gist) {
  const filename = chooseGistFile(gist.files);
  if (!filename) return { filename: null, rows: null };
  const file = gist.files[filename];
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const rawUrl = new URL(file.raw_url);
    if (!["raw.githubusercontent.com", "gist.githubusercontent.com"].includes(rawUrl.hostname)) {
      throw new Error("Gist raw file URL host is not trusted");
    }
    const rawResponse = await fetchWithTimeout(rawUrl.toString(), { headers: authHeaders() });
    if (!rawResponse.ok) throw new Error(`Gist raw file download failed (HTTP ${rawResponse.status})`);
    content = await rawResponse.text();
  }
  if (typeof content !== "string") {
    throw new Error(`Gist file ${filename} has no readable content`);
  }
  return { filename, rows: validateHistoryRecords(JSON.parse(content)) };
}

async function downloadFromCloud() {
  if (!GIST_ID || !GITHUB_TOKEN) {
    return { skipped: true, reason: "GIST_ID or GITHUB_TOKEN is not configured" };
  }
  if (downloadInFlight) return downloadInFlight;
  downloadInFlight = (async () => {
    const response = await fetchWithTimeout(GIST_URL, { headers: authHeaders() });
    const gist = await responseJson(response, "Gist download");
    const remote = await readGistHistory(gist);
    if (!remote.filename) {
      console.warn("[Cloud Sync] No recognized history file in Gist; local history was left unchanged.");
      return { skipped: true, reason: "history file not found" };
    }
    const local = readLocalHistory();
    const merged = mergeHistoryRecords(local, remote.rows);
    writeHistoryAtomic(merged);
    console.log(`[Cloud Sync] Restored/merged ${remote.rows.length} cloud and ${local.length} local signals (${merged.length} total).`);
    return { downloaded: remote.rows.length, local: local.length, merged: merged.length, filename: remote.filename };
  })();
  try {
    return await downloadInFlight;
  } catch (error) {
    console.error("[Cloud Sync] Download failed:", error.message);
    throw error;
  } finally {
    downloadInFlight = null;
  }
}

async function uploadToCloud() {
  if (!GIST_ID || !GITHUB_TOKEN) {
    return { skipped: true, reason: "GIST_ID or GITHUB_TOKEN is not configured" };
  }
  if (uploadInFlight) return uploadInFlight;
  uploadInFlight = (async () => {
    const rows = readLocalHistory();
    const getResponse = await fetchWithTimeout(GIST_URL, { headers: authHeaders() });
    const gist = await responseJson(getResponse, "Gist lookup before upload");
    const remote = await readGistHistory(gist);
    const merged = remote.rows ? mergeHistoryRecords(rows, remote.rows) : rows;
    const filename = remote.filename || chooseGistFile(gist.files) || CANONICAL_FILENAME;
    if (merged.length !== rows.length || merged.some((row, index) => row.id !== rows[index]?.id)) {
      writeHistoryAtomic(merged);
    }
    const response = await fetchWithTimeout(GIST_URL, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(merged, null, 2) } } })
    });
    await responseJson(response, "Gist upload");
    console.log(`[Cloud Sync] Uploaded ${merged.length} merged signals to ${filename}.`);
    return { uploaded: merged.length, filename };
  })();
  try {
    return await uploadInFlight;
  } catch (error) {
    console.error("[Cloud Sync] Upload failed:", error.message);
    throw error;
  } finally {
    uploadInFlight = null;
  }
}

module.exports = {
  downloadFromCloud,
  uploadToCloud,
  validateHistoryRecords,
  mergeHistoryRecords,
  writeHistoryAtomic
};
