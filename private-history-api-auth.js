"use strict";

const crypto = require("node:crypto");

const TOKEN_ENV_NAME = "SIGNAL_HISTORY_API_TOKEN";
const MIN_TOKEN_LENGTH = 32;

function createPrivateHistoryApiAuth(options = {}) {
  const getToken = typeof options.getToken === "function"
    ? options.getToken
    : () => process.env[TOKEN_ENV_NAME];

  return function requirePrivateHistoryApiAuth(req, res, next) {
    const configuredToken = getToken();
    res.setHeader("Cache-Control", "no-store");

    if (typeof configuredToken !== "string" || configuredToken.length < MIN_TOKEN_LENGTH) {
      return res.status(503).json({ ok: false, error: "Private history API authentication is not configured" });
    }

    const authorization = req && req.headers ? req.headers.authorization : undefined;
    const match = typeof authorization === "string"
      ? /^Bearer ([^\s]+)$/i.exec(authorization.trim())
      : null;

    if (!match) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="SmartTradeEngine private history API"');
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }

    const supplied = Buffer.from(match[1], "utf8");
    const expected = Buffer.from(configuredToken, "utf8");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="SmartTradeEngine private history API"');
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    return next();
  };
}

module.exports = { TOKEN_ENV_NAME, MIN_TOKEN_LENGTH, createPrivateHistoryApiAuth };
