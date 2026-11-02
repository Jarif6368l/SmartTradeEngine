const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '.signal-history.json');
const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const FILENAME = 'signal-history.json';

async function downloadFromCloud() {
  if (!GIST_ID || !GITHUB_TOKEN) {
    console.log("[Cloud Sync] Missing GIST_ID or GITHUB_TOKEN.");
    return;
  }
  try {
    console.log("[Cloud Sync] Fetching history from GitHub Gist...");
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    const data = await res.json();
    if (data.files && data.files[FILENAME]) {
      const content = data.files[FILENAME].content;
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(parsed, null, 2));
        console.log(`[Cloud Sync] Downloaded ${parsed.length} signals from Gist!`);
      }
    }
  } catch (e) {
    console.log("[Cloud Sync] Download failed:", e.message);
  }
}

async function uploadToCloud() {
  if (!GIST_ID || !GITHUB_TOKEN) return;
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;
    const localData = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(localData);

    const uploadRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: {
          [FILENAME]: { content: JSON.stringify(parsed, null, 2) }
        }
      })
    });

    if (uploadRes.ok) {
      console.log(`[Cloud Sync] Uploaded ${parsed.length} signals successfully!`);
    } else {
      const err = await uploadRes.json();
      console.log(`[Cloud Sync] Upload failed (Status: ${uploadRes.status}):`, err.message || "Unknown error");
    }
  } catch (e) {
    console.log("[Cloud Sync] Upload error:", e.message);
  }
}

module.exports = { downloadFromCloud, uploadToCloud };
