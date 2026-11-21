"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPrivateHistoryApiAuth,
  MIN_TOKEN_LENGTH,
  MAX_TOKEN_LENGTH
} = require("../private-history-api-auth");

const TOKEN = "test-private-history-token-0123456789";

function invoke(middleware, authorization) {
  const headers = {};
  const req = { headers: authorization === undefined ? {} : { authorization } };
  const res = {
    statusCode: 200,
    body: null,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, headers, nextCalled };
}

test("fails closed when the token is missing or outside accepted bounds", () => {
  for (const token of ["", "short", "x".repeat(MAX_TOKEN_LENGTH + 1)]) {
    const result = invoke(createPrivateHistoryApiAuth({ getToken: () => token }), `Bearer ${TOKEN}`);
    assert.equal(result.res.statusCode, 503);
    assert.equal(result.nextCalled, false);
    assert.equal(result.headers["cache-control"], "no-store");
  }
  assert.ok(MIN_TOKEN_LENGTH >= 32);
});

test("rejects missing and malformed authorization headers", () => {
  const middleware = createPrivateHistoryApiAuth({ getToken: () => TOKEN });
  for (const header of [undefined, "Basic abc", "Bearer", "Bearer token extra"]) {
    const result = invoke(middleware, header);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, false);
    assert.match(result.headers["www-authenticate"], /^Bearer /);
  }
});

test("accepts a matching bearer token case-insensitively", () => {
  const middleware = createPrivateHistoryApiAuth({ getToken: () => TOKEN });
  const result = invoke(middleware, `bearer ${TOKEN}`);
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test("rejects wrong and oversized supplied tokens", () => {
  const middleware = createPrivateHistoryApiAuth({ getToken: () => TOKEN });
  for (const supplied of ["wrong-token", `${TOKEN}x`, "x".repeat(MAX_TOKEN_LENGTH + 1)]) {
    const result = invoke(middleware, `Bearer ${supplied}`);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, false);
  }
});
