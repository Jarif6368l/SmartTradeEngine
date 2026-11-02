const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '.signal-history.json');
const BIN_ID = process.env.JSONBIN_ID;
const API_KEY = process.env.JSONBIN_KEY;

async function downloadFromCloud() {
  if (!BIN_ID || !API_KEY) return;
  try {
    console.log("[Cloud Sync] Fetching latest history from JSONBin...");
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const data = await res.json();
    if (data.record && Array.isArray(data.record)) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(data.record, null, 2));
      console.log(`[Cloud Sync] Downloaded ${data.record.length} signals from cloud!`);
    }
  } catch (e) {
    console.log("[Cloud Sync] Download failed:", e.message);
  }
}

async function uploadToCloud() {
  if (!BIN_ID || !API_KEY) return;
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;
    const localData = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(localData);
    
    await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': API_KEY
      },
      body: JSON.stringify(parsed)
    });
  } catch (e) {
    console.log("[Cloud Sync] Upload failed:", e.message);
  }
}

module.exports = { downloadFromCloud, uploadToCloud };
