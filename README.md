# SmartTradeEngine

## Runtime and Render

- Start command: `npm start` (runs `node server.js`).
- The server uses Render's `PORT` environment variable and binds to `0.0.0.0` by default.
- Node.js 20 or 24 is supported by the CI matrix.

## Twelve Data REST credit safety limit

The application enforces a fixed ceiling of **600 Twelve Data REST request credits per IST calendar day**. The ceiling is hard-coded and cannot be raised through `TELEGRAM_WATCH_DAILY_CREDIT_BUDGET` or another environment override.

The counter covers Twelve Data REST requests made by the market catalog, candle endpoints, current-candle endpoint, and Telegram watcher. Cached responses do not consume a credit. A request reserves its credit before the outbound call, so failed provider requests are conservatively counted. Once 600 credits are reserved, further Twelve Data REST calls are blocked until the next IST day.

This is the application's daily safety ceiling; it is not a statement about Twelve Data's separate plan-level per-minute quota. WebSocket subscriptions are not REST credits and have a separate connection cap of 20 browser clients, same-host Origin validation, and a per-client subscription cooldown. Run a single Render instance for this local-file-backed counter; multiple instances would need a shared atomic quota store.

### Persisting the counter on Render

The budget counter is stored in the watcher state file. Render's ordinary filesystem may be ephemeral across restarts/redeploys. For a durable daily cap, attach a Render persistent disk mounted at `/var/data` and set:

```text
TELEGRAM_WATCH_STATE_FILE=/var/data/.telegram-watcher-state.json
```

On first start with this setting, the app migrates the existing local watcher state into the persistent location if the destination does not yet exist. Do not delete the persistent state file during an IST day; doing so would reset the counter.

## Private history API authentication

The following endpoints require a bearer token:

- `GET /api/notifications`
- `GET /api/signal-history`
- `GET /api/signal-history/export`
- `GET /api/signal-history/stats`

Before deploying this change, configure the Render environment variable `SIGNAL_HISTORY_API_TOKEN` with a randomly generated secret of at least 32 characters. Do not commit the secret or place it in a URL. The History page prompts for the token after an HTTP 401 and keeps it in session storage for the current browser tab.

If the token is missing or weak, the private endpoints fail closed with HTTP 503. Missing or incorrect credentials receive HTTP 401.

## Cloud signal-history synchronization

- Initial cloud history restore completes before the Telegram watcher starts.
- Cloud history is validated and merged by record ID; local history is atomically written with a previous-generation backup.
- Uploads are serialized, validate remote history, merge remote-only records, and run every five minutes.
- If a configured initial Gist restore fails, the dashboard still starts, but the watcher and scheduled uploads remain disabled to avoid overwriting the authoritative cloud history.

Configure `GIST_ID` and `GITHUB_TOKEN` in Render if Gist synchronization is required.

## Tests

Run locally:

```sh
npm ci
npm test
npm audit --audit-level=moderate
```

GitHub Actions runs the test suite on Node.js 20 and 24 and enforces the dependency audit on Node.js 24.

## Operational boundaries

This repository change does not alter Upstox authentication, broker execution, NSE/BSE trading rules, or Indian-market scanning configuration. Live Render environment settings, persistent-disk attachment, Gist contents, Twelve Data account usage, and broker fills must still be verified in their respective live services.
