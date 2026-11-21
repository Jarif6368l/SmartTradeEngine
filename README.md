# SmartTradeEngine

SmartTradeEngine is a Node.js / Express market-analysis dashboard with Telegram signal monitoring and signal-history tracking.

## Render deployment

- Build command: `npm ci`
- Start command: `npm start`
- The server binds to `0.0.0.0` and uses Render's injected `PORT`.
- Keep credentials in Render Environment, never in Git.

## Required environment

| Variable | Purpose |
| --- | --- |
| `TWELVE_DATA_API_KEY` | Twelve Data market-data access |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram alerts |
| `GIST_ID`, `GITHUB_TOKEN` | Optional signal-history cloud sync |
| `SIGNAL_HISTORY_FILE` | Optional path for signal history on a Render persistent disk |
| `SIGNAL_HISTORY_API_TOKEN` | Private history API access; at least 32 and at most 256 characters |
| `TELEGRAM_WATCH_STATE_FILE` | Optional path for persistent watcher state and the 600/day counter |
| `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_REDIRECT_URI` | Existing Upstox OAuth configuration |

Generate a private history API token outside the repository (for example, `openssl rand -hex 32`) and set it as `SIGNAL_HISTORY_API_TOKEN` in Render. The History page prompts for this token when the server returns HTTP 401. It is kept only in the current browser tab's session storage. If the variable is missing or invalid, the private endpoints fail closed with HTTP 503.

## Twelve Data safety budget

The Telegram watcher's internal daily request budget is hard-capped at **600** and resets on the Asia/Kolkata calendar day. Environment variables cannot raise this application-level cap. This is an application safeguard, not a statement of the provider's account-level quota. The separate Twelve Data account quota remains authoritative.

For the 600/day counter and local history to survive Render restarts and redeploys, attach a Render persistent disk (for example, mounted at `/var/data`) and set `TELEGRAM_WATCH_STATE_FILE=/var/data/.telegram-watcher-state.json` and `SIGNAL_HISTORY_FILE=/var/data/.signal-history.json`. Without a persistent disk, Render's ephemeral filesystem can reset local state when the instance is replaced. Gist cloud sync remains an additional history backup.

## Local checks

```sh
npm ci
npm test
npm audit --audit-level=moderate
```

The Android wrapper is a WebView client. It needs the deployed HTTPS server URL; it does not embed a Node.js server.

## Signal history backup and recovery

Create a timestamped snapshot and SHA-256 manifest:

```sh
node scripts/signal-history-backup.js backup
```

Verify a snapshot before any restore:

```sh
node scripts/signal-history-backup.js verify /path/to/signal-history-<timestamp>.json
```

Restore is destructive and requires explicit confirmation:

```sh
node scripts/signal-history-backup.js restore /path/to/signal-history-<timestamp>.json --confirm
```

Stop the watcher before taking a filesystem-level backup, and copy the snapshot plus manifest to an independent location. This utility is local-only; it does not change Render settings or access broker/market integrations.
