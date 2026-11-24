"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("telegram-watcher.js", "utf8");
const match = source.match(
  /function requireTelegramDelivery\(result\) \{[\s\S]*?\n\}/
);

if (!match) {
  throw new Error("Could not locate requireTelegramDelivery");
}

const requireTelegramDelivery = vm.runInNewContext(
  `(${match[0]})`,
  {}
);

test("trade alert is accepted only with a Telegram message_id", () => {
  assert.throws(
    () => requireTelegramDelivery(null),
    /Telegram did not confirm trade-alert delivery/
  );
  assert.throws(
    () => requireTelegramDelivery({ ok: true }),
    /Telegram did not confirm trade-alert delivery/
  );
  const result = { message_id: 12345 };
  assert.equal(requireTelegramDelivery(result), result);
});

test("all new-signal replacement paths require Telegram confirmation before History writes", () => {
  const start = source.indexOf("async function scanMarket(");
  const end = source.indexOf("\n\nfunction startTelegramTradeWatcher(", start);
  assert.notEqual(start, -1, "scanMarket must exist");
  assert.notEqual(end, -1, "startTelegramTradeWatcher must exist");
  const scan = source.slice(start, end);

  assert.equal(
    scan.split("requireTelegramDelivery(await sendTelegram(text));").length - 1,
    3,
    "new, materially changed, and style-changed alerts must all require confirmed delivery"
  );
});
