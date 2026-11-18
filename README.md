# SmartTradeEngine

## Private signal-history API authentication

The following read-only endpoints require a bearer token:

- `GET /api/notifications`
- `GET /api/signal-history`
- `GET /api/signal-history/export`
- `GET /api/signal-history/stats`

Configure the Render environment variable `SIGNAL_HISTORY_API_TOKEN` with a randomly generated secret containing at least 32 characters. Treat it as a password: do not commit it, put it in a URL, or expose it in browser-side JavaScript.

Call a protected endpoint with an `Authorization: Bearer YOUR_SECRET_TOKEN` header.

If the environment variable is absent or shorter than 32 characters, these endpoints fail closed with HTTP 503. Missing or invalid credentials receive HTTP 401. The public trading dashboard and unrelated market-data endpoints are not covered by this middleware.

The dashboard does not embed this secret. Any external client or operator that needs these private endpoints must send the bearer header from a trusted server-side environment.
