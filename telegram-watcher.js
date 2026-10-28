const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  execFileSync
} = require("child_process");

const {
  addSignalHistory,
  closeSignalHistory,
  getSignalHistoryById,
  updateSignalHistory,
  getSignalHistoryStats,
  exportSignalHistory,
  deleteSignalHistory
} = require("./signal-history");


/* === DEMO / PAPER TRADING HOOKS (isolated, fail-safe) === */

let paperTrading = null;
try {
  paperTrading = require("./paper-trading");
} catch (e) {
  console.warn(
    "[Demo] paper-trading module unavailable:",
    e && e.message
  );
}

function notifyDemoNewSignal(historyEntry) {
  try {
    if (!paperTrading) return;
    if (
      typeof paperTrading.onNewSignal !== "function"
    ) {
      return;
    }
    paperTrading.onNewSignal(historyEntry);
  } catch (e) {
    console.error(
      "[Demo] onNewSignal hook failed:",
      e && e.message
    );
  }
}

function notifyDemoOutcome(updatedRecord) {
  try {
    if (!paperTrading) return;
    if (
      typeof paperTrading.onOutcomeUpdate !== "function"
    ) {
      return;
    }
    paperTrading.onOutcomeUpdate(updatedRecord);
  } catch (e) {
    console.error(
      "[Demo] onOutcomeUpdate hook failed:",
      e && e.message
    );
  }
}


function getEngineVersion() {

  try {

    return execFileSync(
      "git",
      [
        "rev-parse",
        "--short",
        "HEAD"
      ],
      {
        cwd:
          __dirname,

        encoding:
          "utf8"
      }
    ).trim() || "unknown";

  } catch {

    return "unknown";
  }
}


const ENGINE_VERSION =
  getEngineVersion();

const DATA_SOURCE =
  "Twelve Data";


const WATCH_MARKETS = [
  {
    symbol: "BTC/USD",
    type: "crypto",
    exchange: "Binance"
  },
  {
    symbol: "ETH/USD",
    type: "crypto",
    exchange: "Binance"
  },
  {
    symbol: "SOL/USD",
    type: "crypto",
    exchange: "Binance"
  },
  {
    symbol: "XRP/USD",
    type: "crypto",
    exchange: "Binance"
  },
  {
    symbol: "EUR/USD",
    type: "forex",
    exchange: ""
  },
  {
    symbol: "GBP/USD",
    type: "forex",
    exchange: ""
  },
  {
    symbol: "USD/JPY",
    type: "forex",
    exchange: ""
  },
  {
    symbol: "AUD/USD",
    type: "forex",
    exchange: ""
  },
  {
    symbol: "RELIANCE",
    type: "stocks",
    exchange: "NSE"
  },
  {
    symbol: "TCS",
    type: "stocks",
    exchange: "NSE"
  },
  {
    symbol: "HDFCBANK",
    type: "stocks",
    exchange: "NSE"
  },
  {
    symbol: "ICICIBANK",
    type: "stocks",
    exchange: "NSE"
  },
  {
    symbol: "INFY",
    type: "stocks",
    exchange: "NSE"
  },
  {
    symbol: "SBIN",
    type: "stocks",
    exchange: "NSE"
  },
  {
    symbol: "BHARTIARTL",
    type: "stocks",
    exchange: "NSE"
  },
  {
    symbol: "ITC",
    type: "stocks",
    exchange: "NSE"
  }
];

const MODES = [
  "scalping",
  "intraday",
  "swing"
];

const FRAME_CONFIG = {
  m15: {
    interval: "15min",
    outputsize: 2400,
    ttl: 20 * 60 * 1000,
    minimum: 100
  },

  h1: {
    interval: "1h",
    outputsize: 1800,
    ttl: 55 * 60 * 1000,
    minimum: 100
  },

  h4: {
    interval: "4h",
    outputsize: 1200,
    ttl: 210 * 60 * 1000,
    minimum: 100
  },

  d1: {
    interval: "1day",
    outputsize: 730,
    ttl: 20 * 60 * 60 * 1000,
    minimum: 60
  }
};

const ROTATION_MS =
  Math.max(
    4 * 60 * 1000,
    Number(
      process.env.TELEGRAM_WATCH_ROTATION_MS
    ) || 4 * 60 * 1000
  );

const DAILY_CREDIT_BUDGET =
  Math.max(
    100,
    Number(
      process.env.TELEGRAM_WATCH_DAILY_CREDIT_BUDGET
    ) || 600
  );

const STATE_FILE =
  path.join(
    __dirname,
    ".telegram-watcher-state.json"
  );



const STATE_PREV_FILE =
  `${STATE_FILE}.prev`;
const frameCache =
  new Map();

let marketIndex = 0;
let started = false;
let tickRunning = false;
let indiaTickRunning = false;

let recoveryInFlight = false;


const watcherHealth = {
  started: false,
  enabled: false,
  startedAt: null,
  lastTickStartedAt: null,
  lastTickCompletedAt: null,
  lastTickError: null,
  currentMarket: null
};


function getTelegramWatcherStatus() {

  const now =
    Date.now();


  const staleAfterMs =
    Math.max(
      15 * 60 * 1000,
      ROTATION_MS * 3
    );


  const credentialsConfigured =
    Boolean(
      String(
        process.env
          .TELEGRAM_BOT_TOKEN ||
        ""
      ).trim() &&
      String(
        process.env
          .TELEGRAM_CHAT_ID ||
        ""
      ).trim()
    );


  const referenceMs =
    Date.parse(
      watcherHealth
        .lastTickCompletedAt ||
      watcherHealth
        .startedAt ||
      ""
    );


  const stale =
    Boolean(
      watcherHealth.enabled &&
      Number.isFinite(
        referenceMs
      ) &&
      now - referenceMs >
        staleAfterMs
    );


  const healthy =
    credentialsConfigured
      ? Boolean(
          watcherHealth.started &&
          watcherHealth.enabled &&
          !stale
        )
      : true;


  return {
    healthy,
    started:
      watcherHealth.started,
    enabled:
      watcherHealth.enabled,
    credentialsConfigured,
    stale,
    staleAfterMs,
    tickRunning,
    currentMarket:
      watcherHealth.currentMarket,
    lastTickStartedAt:
      watcherHealth.lastTickStartedAt,
    lastTickCompletedAt:
      watcherHealth.lastTickCompletedAt,
    lastTickError:
      watcherHealth.lastTickError,
    marketIndex
  };
}


async function runWatcherTickExclusive(
  task
) {

  if (
    typeof task !==
    "function"
  ) {
    throw new TypeError(
      "Watcher tick task must be a function"
    );
  }


  if (tickRunning) {
    return false;
  }


  tickRunning = true;


  try {

    await task();

    return true;

  } finally {

    /*
     * Always release the lock, even if
     * the scan throws an unexpected error.
     */
    tickRunning = false;
  }
}


function loadBrowserEngines() {

  const context =
    vm.createContext({
      window: {},
      console
    });

  const files = [
    "engines.js",
    "smc.js",
    "mtf.js",
    "mode-engine.js",
    "risk.js",
    "reasoning.js"
  ];

  for (const file of files) {

    const fullPath =
      path.join(
        __dirname,
        "public",
        file
      );

    const source =
      fs.readFileSync(
        fullPath,
        "utf8"
      );

    vm.runInContext(
      source,
      context,
      {
        filename: file
      }
    );
  }

  return context.window;
}


const {
  MarketStructureEngine,
  PriceActionEngine,
  SmcIctEngine,
  MultiTimeframeEngine,
  ModeAnalysisEngine,
  RiskEngine,
  ReasoningEngine
} = loadBrowserEngines();



function normalizeMarketIndex(
  value
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number) ||
    WATCH_MARKETS.length === 0
  ) {
    return 0;
  }


  const integer =
    Math.max(
      0,
      Math.floor(number)
    );


  return (
    integer %
    WATCH_MARKETS.length
  );
}


function defaultState() {

  return {
    day:
      new Date()
        .toISOString()
        .slice(0, 10),

    watcherCredits: 0,


    marketIndex: 0,

    alerts: {},


    /* === OFFLINE → ONLINE RECOVERY STATE === */

    lastSuccessfulScanAt:
      null,

    lastSuccessfulScanAtByMarket: {},

    recovery: {
      lastRecoveryId: null,
      lastRecoveryAt: null,
      lastRecoveryStart: null,
      lastRecoveryEnd: null,
      lastRecoveryStatus: null,
      processedRecoveryIds: []
    },


    /* === DAILY WATCHER BUDGET ALERT STATE === */

    budgetAlert: {
      lastAlertDay: null,
      lastAlertAt: null
    }
  };
}


/* === OFFLINE → ONLINE RECOVERY HELPERS === */

const RECOVERY_GAP_THRESHOLD_MS =
  15 * 60 * 1000;              // 15 minutes

const RECOVERY_MAX_WINDOW_MS =
  24 * 60 * 60 * 1000;         // 24 hours


function recoveryMarketKey(market) {

  const exchange =
    String(
      market.exchange || ""
    )
      .trim()
      .toUpperCase();

  if (exchange === "NSE" || exchange === "BSE") {
    return exchange + ":" + market.symbol;
  }

  if (market.type === "forex") {
    return "FOREX:" + market.symbol;
  }

  return (
    (exchange || "BINANCE") +
    ":" +
    market.symbol
  );
}


function isNetworkLikeError(error) {

  const msg =
    String(
      (error && error.message) ||
      error ||
      ""
    ).toLowerCase();

  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("aborted")
  );
}


function isNonRecoverableError(error) {

  const msg =
    String(
      (error && error.message) ||
      error ||
      ""
    ).toLowerCase();

  return (
    msg.includes("credit budget reached") ||
    msg.includes("history insufficient") ||
    msg.includes("invalid token") ||
    msg.includes("not authorized") ||
    msg.includes("unsupported") ||
    msg.includes("credentials missing")
  );
}


function istDateParts(dateMs) {

  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }
    )
      .formatToParts(
        new Date(dateMs)
      )
      .reduce(
        (acc, p) => {
          acc[p.type] = p.value;
          return acc;
        },
        {}
      );

  return parts;
}


function isIndiaMarketTime(dateMs) {

  const p =
    istDateParts(dateMs);

  if (
    ["Sat", "Sun"].includes(
      p.weekday
    )
  ) {
    return false;
  }

  const mins =
    Number(p.hour) * 60 +
    Number(p.minute);

  return (
    mins >= 9 * 60 + 15 &&
    mins < 15 * 60 + 30
  );
}


function isTwelveDataMarketTime(dateMs) {

  const p =
    istDateParts(dateMs);

  const hour =
    Number(p.hour);

  return (
    hour >= 7 &&
    hour < 24
  );
}


function isMarketActiveInWindow(
  market,
  startMs,
  endMs
) {

  const exchange =
    String(
      market.exchange || ""
    )
      .trim()
      .toUpperCase();

  const isIndia =
    exchange === "NSE" ||
    exchange === "BSE";

  /* Sample the window in 15-min buckets. If any bucket is inside
     the market schedule, consider the market active. */
  const STEP =
    15 * 60 * 1000;

  for (
    let t = startMs;
    t <= endMs;
    t += STEP
  ) {

    if (
      isIndia &&
      isIndiaMarketTime(t)
    ) {
      return true;
    }

    if (
      !isIndia &&
      isTwelveDataMarketTime(t)
    ) {
      return true;
    }
  }

  return false;
}


function validStateRoot(
  value
) {

  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}


function readStateFile(
  filePath
) {

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );


  const parsed =
    JSON.parse(
      raw
    );


  if (
    !validStateRoot(
      parsed
    )
  ) {

    throw new Error(
      "Invalid watcher state root"
    );
  }


  return {
    ...defaultState(),
    ...parsed,

    marketIndex:
      normalizeMarketIndex(
        parsed.marketIndex
      ),

    alerts:
      parsed.alerts &&
      typeof parsed.alerts === "object" &&
      !Array.isArray(
        parsed.alerts
      )
        ? parsed.alerts
        : {}
  };
}


function readStateFromPaths(
  primaryFile,
  previousFile,
  logRecovery = false
) {

  try {

    return readStateFile(
      primaryFile
    );

  } catch (
    primaryError
  ) {

    try {

      const recovered =
        readStateFile(
          previousFile
        );


      if (logRecovery) {

        console.warn(
          "[Telegram Watcher] Primary state unavailable/corrupt • recovered previous state"
        );
      }


      return recovered;

    } catch {

      return defaultState();
    }
  }
}


function readState() {

  return readStateFromPaths(
    STATE_FILE,
    STATE_PREV_FILE,
    true
  );
}


let watcherState =
  readState();


marketIndex =
  normalizeMarketIndex(
    watcherState.marketIndex
  );


watcherState.marketIndex =
  marketIndex;

function resetDailyBudgetIfNeeded() {

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  if (
    watcherState.day !==
    today
  ) {

    watcherState.day =
      today;

    watcherState.watcherCredits =
      0;
  }
}


function writeStateAtomic(
  filePath,
  state
) {

  const tmpFile =
    `${filePath}.tmp`;

  const previousFile =
    `${filePath}.prev`;

  const previousTmpFile =
    `${filePath}.prev.tmp`;


  const json =
    JSON.stringify(
      state,
      null,
      2
    );


  let rotateCurrent =
    false;


  if (
    fs.existsSync(
      filePath
    )
  ) {

    try {

      const current =
        JSON.parse(
          fs.readFileSync(
            filePath,
            "utf8"
          )
        );


      rotateCurrent =
        validStateRoot(
          current
        );

    } catch {

      /*
       * Do not overwrite a good .prev backup
       * with a corrupt primary state.
       */
      rotateCurrent =
        false;
    }
  }


  try {

    fs.writeFileSync(
      tmpFile,
      json,
      "utf8"
    );


    /*
     * Flush temporary file before rename.
     */
    const fd =
      fs.openSync(
        tmpFile,
        "r"
      );


    try {

      fs.fsyncSync(
        fd
      );

    } finally {

      fs.closeSync(
        fd
      );
    }


    if (
      rotateCurrent
    ) {

      fs.copyFileSync(
        filePath,
        previousTmpFile
      );

      fs.renameSync(
        previousTmpFile,
        previousFile
      );
    }


    /*
     * Atomic replacement of the primary state.
     */
    fs.renameSync(
      tmpFile,
      filePath
    );

  } catch (error) {

    for (
      const temp of [
        tmpFile,
        previousTmpFile
      ]
    ) {

      try {

        if (
          fs.existsSync(
            temp
          )
        ) {
          fs.unlinkSync(
            temp
          );
        }

      } catch {}
    }


    throw error;
  }
}


function saveState() {

  try {

    watcherState.marketIndex =
      normalizeMarketIndex(
        marketIndex
      );


    writeStateAtomic(
      STATE_FILE,
      watcherState
    );

  } catch (error) {

    console.error(
      "[Telegram Watcher] State save failed:",
      error.message
    );
  }
}


function normalizeCandles(raw) {

  if (!Array.isArray(raw)) {
    return [];
  }

  const rows = [];

  raw.forEach(
    (c, index) => {

      if (!c || typeof c !== "object" || Array.isArray(c)) {
        return;
      }

      const open =
        Number(c.open);

      const high =
        Number(c.high);

      const low =
        Number(c.low);

      const close =
        Number(c.close);

      const rawVolume =
        Number(c.volume);

      const volume =
        Number.isFinite(rawVolume)
          ? rawVolume
          : 0;

      const rawTime =
        c.time ??
        c.datetime ??
        c.timestamp;

      if (
        rawTime === undefined ||
        rawTime === null ||
        (typeof rawTime === "string" && rawTime.trim() === "")
      ) {
        return;
      }

      let sortTime;

      if (
        typeof rawTime ===
        "number"
      ) {

        sortTime =
          rawTime;

      } else {

        const numeric =
          Number(rawTime);

        sortTime =
          Number.isFinite(numeric)
            ? numeric
            : Date.parse(
                rawTime
              );
      }

      if (
        !Number.isFinite(sortTime) ||
        sortTime <= 0 ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return;
      }

      if (
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0 ||
        high < low ||
        high < open ||
        high < close ||
        low > open ||
        low > close
      ) {
        return;
      }

      rows.push({
        time: rawTime,
        open,
        high,
        low,
        close,
        volume,
        _sortTime: sortTime,
        _index: index
      });
    }
  );

  rows.sort(
    (a, b) =>
      a._sortTime -
        b._sortTime ||
      a._index -
        b._index
  );

  const unique =
    new Map();

  for (const row of rows) {

    unique.set(
      row._sortTime,
      row
    );
  }

  return Array.from(
    unique.values()
  )
    .sort(
      (a, b) =>
        a._sortTime -
        b._sortTime
    )
    .map(
      ({
        _sortTime,
        _index,
        ...candle
      }) => candle
    );
}


function budgetAvailable() {

  resetDailyBudgetIfNeeded();

  return (
    watcherState.watcherCredits <
    DAILY_CREDIT_BUDGET
  );
}


/* === DAILY WATCHER BUDGET ALERT ===
 *
 * Sends one Telegram alert per IST calendar day when the app's
 * daily watcher-credit safety cap is exhausted.
 *
 * This is the APP'S watcher safety cap (DAILY_CREDIT_BUDGET),
 * NOT the Twelve Data provider's own account quota.
 *
 * Failure here must never crash or block the watcher.
 */
function currentIstDay() {

  try {
    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }
      )
        .formatToParts(new Date())
        .reduce((acc, p) => {
          acc[p.type] = p.value;
          return acc;
        }, {});

    return (
      parts.year + "-" +
      parts.month + "-" +
      parts.day
    );
  } catch {
    /* Extremely defensive fallback — should not normally hit */
    return new Date().toISOString().slice(0, 10);
  }
}


async function maybeNotifyBudgetExhausted() {

  try {

    resetDailyBudgetIfNeeded();

    if (
      watcherState.watcherCredits <
      DAILY_CREDIT_BUDGET
    ) {
      return;
    }

    const today = currentIstDay();

    if (
      !watcherState.budgetAlert ||
      typeof watcherState.budgetAlert !== "object"
    ) {
      watcherState.budgetAlert = {
        lastAlertDay: null,
        lastAlertAt: null
      };
    }

    if (
      watcherState.budgetAlert.lastAlertDay === today
    ) {
      return;
    }

    const text = [
      "⚠️ TWELVE DATA WATCHER BUDGET EXHAUSTED",
      "",
      "Used: " +
        watcherState.watcherCredits +
        "/" +
        DAILY_CREDIT_BUDGET,
      "Crypto/Forex watcher scanning paused.",
      "Daily watcher budget will reset on the next day.",
      "",
      "Note: This is the app's daily watcher safety cap, not the Twelve Data provider's own account limit."
    ].join("\n");

    try {
      await sendTelegram(text);
    } catch (e) {
      console.error(
        "[Telegram Watcher] Budget exhaustion alert failed:",
        e.message
      );
      /* Do not mark as sent — allow retry on next tick same day */
      return;
    }

    watcherState.budgetAlert.lastAlertDay =
      today;

    watcherState.budgetAlert.lastAlertAt =
      new Date().toISOString();

    saveState();

    console.log(
      "[Telegram Watcher] Budget exhaustion alert sent for " +
      today +
      " (" +
      watcherState.watcherCredits +
      "/" +
      DAILY_CREDIT_BUDGET +
      ")"
    );

  } catch (error) {
    console.error(
      "[Telegram Watcher] maybeNotifyBudgetExhausted error:",
      error.message
    );
  }
}


function spendCredit() {

  resetDailyBudgetIfNeeded();

  watcherState.watcherCredits +=
    1;
}


async function fetchFrame(
  fetchTwelveCandles,
  market,
  key
) {

  const config =
    FRAME_CONFIG[key];

  let pair =
    frameCache.get(
      market.symbol
    );

  if (!pair) {

    pair = {};

    frameCache.set(
      market.symbol,
      pair
    );
  }

  const cached =
    pair[key];

  const now =
    Date.now();

  if (
    cached &&
    now - cached.fetchedAt <
      config.ttl
  ) {

    return cached.candles;
  }

  const usesWatcherCredit =
    !["NSE", "BSE"].includes(
      String(
        market.exchange || ""
      ).trim().toUpperCase()
    );

  if (
    usesWatcherCredit &&
    !budgetAvailable()
  ) {

    throw new Error(
      "Watcher daily API credit budget reached"
    );
  }

  if (usesWatcherCredit) {
    spendCredit();
  }

  const result =
    await fetchTwelveCandles(
      market.symbol,
      config.interval,
      market.exchange,
      config.outputsize
    );

  const candles =
    normalizeCandles(
      result.candles
    );

  if (
    candles.length <
    config.minimum
  ) {

    throw new Error(
      `${key} history insufficient (${candles.length})`
    );
  }

  pair[key] = {
    fetchedAt: now,
    candles
  };

  return candles;
}


async function getFrames(
  fetchTwelveCandles,
  market
) {

  const frames = {};

  for (
    const key of [
      "m15",
      "h1",
      "h4",
      "d1"
    ]
  ) {

    frames[key] =
      await fetchFrame(
        fetchTwelveCandles,
        market,
        key
      );
  }

  return frames;
}


function analyzeMode(
  frames,
  mode
) {

  const mtf =
    new MultiTimeframeEngine()
      .analyze(
        frames.d1,
        frames.h4,
        frames.h1,
        frames.m15,
        mode
      );

  const style =
    new ModeAnalysisEngine()
      .analyze(
        frames,
        mode
      );

  const executionCandles =
    mode === "swing"
      ? frames.h1
      : frames.m15;

  const structure =
    new MarketStructureEngine()
      .analyze(
        executionCandles
      );

  const priceAction =
    new PriceActionEngine()
      .analyze(
        executionCandles,
        structure
      );

  const smc =
    new SmcIctEngine()
      .analyze(
        executionCandles,
        structure
      );

  const risk =
    new RiskEngine()
      .analyze(
        executionCandles,
        structure,
        priceAction,
        smc,
        mtf
      );

  risk.executionTimeframe =
    mode === "swing"
      ? "1H"
      : "15m";

  const reasoning =
    new ReasoningEngine()
      .analyze(
        structure,
        priceAction,
        smc,
        mtf,
        risk
      );

  return {
    mtf,
    style,
    risk,
    reasoning
  };
}



function validCandidateLevels(analysis) {
  const risk = analysis?.risk;
  if (!risk) return false;

  const fields = [
    "entryLow", "entryHigh", "entryReference",
    "stopLoss", "target1", "target2", "rr1", "rr2", "riskReward"
  ];

  for (const field of fields) {
    const value = risk[field];

    if (
      (typeof value !== "number" && typeof value !== "string") ||
      String(value).trim() === "" ||
      !Number.isFinite(Number(value)) ||
      Number(value) <= 0
    ) {
      return false;
    }
  }

  const low = Number(risk.entryLow);
  const high = Number(risk.entryHigh);
  const entry = Number(risk.entryReference);
  const stop = Number(risk.stopLoss);
  const t1 = Number(risk.target1);
  const t2 = Number(risk.target2);
  const reportedRR1 = Number(risk.rr1);
  const reportedRR2 = Number(risk.rr2);
  const reportedRiskReward = Number(risk.riskReward);

  if (
    low > high ||
    entry < low ||
    entry > high
  ) {
    return false;
  }

  const styleDirection = String(
    analysis.style?.bias || ""
  ).trim().toUpperCase();

  const riskDirection = String(
    risk.directionalContext || ""
  ).trim().toUpperCase();

  // Do not accept malformed substring directions.
  const styleBullish = styleDirection === "BULLISH";
  const styleBearish = styleDirection === "BEARISH";
  const riskBullish =
    /^(BULLISH|BULLISH\s+—\s+UNCONFIRMED)$/.test(riskDirection);
  const riskBearish =
    /^(BEARISH|BEARISH\s+—\s+UNCONFIRMED)$/.test(riskDirection);

  // Require explicit, unambiguous Style and Risk directions.
  // Matching UNCONFIRMED directional labels remain valid.
  if (
    styleBullish === styleBearish ||
    riskBullish === riskBearish ||
    styleBullish !== riskBullish ||
    styleBearish !== riskBearish
  ) {
    return false;
  }

  const bullish = styleBullish;
  const bearish = styleBearish;

  let riskDistance;
  let actualRR1;
  let actualRR2;

  if (bullish) {
    if (!(stop < low && t1 > high && t2 > t1)) {
      return false;
    }

    riskDistance = entry - stop;
    actualRR1 = (t1 - entry) / riskDistance;
    actualRR2 = (t2 - entry) / riskDistance;
  } else {
    if (!(stop > high && t1 < low && t2 < t1)) {
      return false;
    }

    riskDistance = stop - entry;
    actualRR1 = (entry - t1) / riskDistance;
    actualRR2 = (entry - t2) / riskDistance;
  }

  if (
    !Number.isFinite(riskDistance) ||
    riskDistance <= 0 ||
    !Number.isFinite(actualRR1) ||
    !Number.isFinite(actualRR2)
  ) {
    return false;
  }

  // Reject setups whose actual T1 reward/risk is below 1.5R.
  if (actualRR1 < 1.5 - 1e-12) {
    return false;
  }

  // The ratios shown in Telegram must agree with the actual prices.
  const rrTolerance = 0.03;

  if (
    Math.abs(reportedRR1 - actualRR1) > rrTolerance ||
    Math.abs(reportedRR2 - actualRR2) > rrTolerance ||
    Math.abs(reportedRiskReward - actualRR2) > rrTolerance
  ) {
    return false;
  }

  return true;
}

function isTradeCandidate(analysis) {
  return Boolean(
    analysis?.style?.plan?.status === "TRADE-CANDIDATE" &&
    analysis?.risk?.decision === "TRADE-CANDIDATE" &&
    validCandidateLevels(analysis)
  );
}

function formatPrice(
  value,
  market
) {

  if (
    !Number.isFinite(
      Number(value)
    )
  ) {
    return "--";
  }

  const number =
    Number(value);

  let digits = 2;

  if (
    market.type === "forex"
  ) {

    digits =
      market.symbol.includes(
        "JPY"
      )
        ? 3
        : 5;

  } else if (
    number < 1
  ) {

    digits = 6;

  } else if (
    number < 100
  ) {

    digits = 4;
  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits
    }
  );
}


function formatRR(value) {

  return Number.isFinite(
    Number(value)
  )
    ? "1 : " +
      Number(value)
        .toFixed(2)
    : "--";
}


function formatAlertTime() {

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone:
        "Asia/Kolkata",

      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",

      hour12:
        true
    }
  ).format(
    new Date()
  ) + " IST";
}


function modeLabel(mode) {

  if (mode === "scalping") {
    return "Scalping";
  }

  if (mode === "swing") {
    return "Swing";
  }

  return "Intraday";
}


function buildAlert(
  market,
  mode,
  analysis
) {
  if (!isTradeCandidate(analysis)) {
    throw new Error(
      `Refusing to build trade alert for ${market?.symbol || "unknown"}: candidate validation failed`
    );
  }


  const risk = analysis.risk || {};
  const direction =
    analysis.style?.bias ||
    risk.directionalContext ||
    "UNKNOWN";

  const directionUpper = String(direction).toUpperCase();
  const directionIcon = directionUpper.includes("BULLISH")
    ? "🟢"
    : directionUpper.includes("BEARISH")
      ? "🔴"
      : "⚪";

  const price = value => {
    if (value === null || value === undefined || value === "") {
      return "--";
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "--";
    }

    const symbolParts = String(market?.symbol || "")
      .toUpperCase()
      .split(/[\\/_:-]/);

    const currencies = new Set([
      "USD", "EUR", "GBP", "JPY", "AUD", "NZD",
      "CAD", "CHF", "CNY", "INR", "SGD", "HKD",
      "NOK", "SEK", "MXN", "ZAR", "TRY"
    ]);

    const isForexPair =
      symbolParts.length === 2 &&
      symbolParts.every(code => currencies.has(code));

    if (isForexPair) {
      return number.toFixed(
        symbolParts.includes("JPY") ? 3 : 5
      );
    }

    return number.toLocaleString("en-US", {
      useGrouping: false,
      maximumSignificantDigits: 8
    });
  };

  const ratio = value => {
    if (value === null || value === undefined || value === "") {
      return "--";
    }
    const number = Number(value);
    return Number.isFinite(number) ? `1 : ${number.toFixed(2)}` : "--";
  };

  const quality = Number(risk.setupQuality);
  const qualityText = Number.isFinite(quality)
    ? `${Math.round(quality)}/100`
    : "--";

  return [
    "🚨 NEW TRADE SETUP",
    "",
    `${market.symbol} • ${modeLabel(mode)}`,
    `${directionIcon} ${direction}`,
    `Setup Quality: ${qualityText}`,
    `Execution: ${risk.executionTimeframe || (mode === "swing" ? "1H" : "15m")}`,
    `Time: ${formatAlertTime()}`,
    "",
    "📍 ENTRY ZONE",
    `${price(risk.entryLow)} → ${price(risk.entryHigh)}`,
    `Reference Price: ${price(risk.entryReference)}`,
    "",
    "🛑 STOP LOSS",
    price(risk.stopLoss),
    "",
    "🎯 TARGET 1",
    price(risk.target1),
    `R:R T1: ${ratio(risk.rr1)}`,
    "",
    "🏆 TARGET 2",
    price(risk.target2),
    `R:R T2: ${ratio(risk.rr2)}`,
    "",
    "✅ TRADE-CANDIDATE confirmed"
  ].join("\n");
}


async function fetchWithTimeout(
  fetchFn,
  url,
  options = {},
  timeoutMs = 12000
) {

  if (
    typeof fetchFn !==
    "function"
  ) {

    throw new TypeError(
      "Fetch function unavailable"
    );
  }


  const requested =
    Number(
      timeoutMs
    );


  const safeTimeout =
    Number.isFinite(
      requested
    ) &&
    requested > 0
      ? requested
      : 12000;


  const controller =
    new AbortController();


  let timer;


  const timeoutPromise =
    new Promise(
      (
        resolve,
        reject
      ) => {

        timer =
          setTimeout(
            () => {

              controller.abort();

              reject(
                new Error(
                  `Request timed out after ${safeTimeout}ms`
                )
              );
            },
            safeTimeout
          );
      }
    );


  const requestPromise =
    (
      async () => {

        const response =
          await fetchFn(
            url,
            {
              ...options,

              signal:
                controller.signal
            }
          );


        const data =
          await response.json();


        return {
          response,
          data
        };
      }
    )();


  try {

    return await Promise.race(
      [
        requestPromise,
        timeoutPromise
      ]
    );

  } finally {

    clearTimeout(
      timer
    );
  }
}


async function sendTelegram(
  text
) {

  const token =
    String(
      process.env
        .TELEGRAM_BOT_TOKEN ||
      ""
    ).trim();

  const chatId =
    String(
      process.env
        .TELEGRAM_CHAT_ID ||
      ""
    ).trim();

  if (
    !token ||
    !chatId
  ) {

    throw new Error(
      "Telegram credentials missing"
    );
  }

  const configuredTimeout =
    Number(
      process.env
        .TELEGRAM_SEND_TIMEOUT_MS
    );


  const timeoutMs =
    Number.isFinite(
      configuredTimeout
    ) &&
    configuredTimeout > 0
      ? configuredTimeout
      : 12000;


  const {
    data
  } =
    await fetchWithTimeout(
      fetch,
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            chat_id:
              chatId,

            text
          })
      },
      timeoutMs
    );

  if (!data.ok) {

    throw new Error(
      data.description ||
      "Telegram send failed"
    );
  }

  return data.result || null;
}



/* === SL HIT REASON: factual reason derivation from existing stored data ===
 *
 * Uses ONLY already-stored fields on the history record. No brain re-run.
 * No speculative claims (no structure/MTF/SMC post-hoc analysis).
 */
function deriveSlReason(record, market) {

  if (!record) {
    return "SL level was breached.";
  }

  const direction =
    String(record.direction || "")
      .toUpperCase();

  const sl =
    Number(record.stopLoss);

  const slText =
    Number.isFinite(sl)
      ? formatPrice(sl, market || {})
      : "SL";

  /* Priority A: T1 was touched earlier, then reversed into SL */
  if (record.t1HitAt) {
    return "Target 1 was touched earlier; price later reversed and breached SL.";
  }

  /* Priority B: reasoning.invalidation was stored at signal time (thesis-level) */
  const invalidation =
    String(record.invalidation || "").trim();

  if (invalidation) {
    return invalidation + " — SL level was breached.";
  }

  /* Priority C: minimum factual fallback */
  const dirLabel =
    direction.includes("BULLISH")
      ? "Bullish"
      : direction.includes("BEARISH")
        ? "Bearish"
        : "";

  if (dirLabel) {
    return dirLabel + " trade SL level was breached at " + slText + ".";
  }

  return "SL level was breached at " + slText + ".";
}


function buildOutcomeAlert(
  outcomeRecord,
  marketSymbol
) {

  const outcome =
    String(
      outcomeRecord?.outcome ||
      ""
    ).toUpperCase();

  const outcomeTitle =
    outcome === "T1_HIT"
      ? "🎯 TARGET 1 HIT"
      : outcome === "T2_HIT"
        ? "🏆 TARGET 2 HIT"
        : outcome === "SL_HIT"
          ? "🛑 STOP LOSS HIT"
          : null;

  if (!outcomeTitle) {
    return null;
  }

  const outcomePrice =
    outcome === "T1_HIT"
      ? outcomeRecord.target1
      : outcome === "T2_HIT"
        ? outcomeRecord.target2
        : outcomeRecord.stopLoss;

  const lines = [
    outcomeTitle,
    "",
    `${outcomeRecord.symbol || marketSymbol} • ${outcomeRecord.styleLabel || modeLabel(outcomeRecord.mode)}`,
    `${outcomeRecord.direction || "UNKNOWN"}`,
    `Level: ${outcomePrice}`
  ];

  /* Factual reason line — SL_HIT only (uses already-stored data only) */
  if (outcome === "SL_HIT") {

    const market = {
      symbol: outcomeRecord.symbol || marketSymbol,
      type: outcomeRecord.marketType || "",
      exchange: outcomeRecord.exchange || ""
    };

    const reason =
      outcomeRecord.slReason ||
      deriveSlReason(outcomeRecord, market);

    if (reason) {
      lines.push(
        `Reason: ${reason}`
      );
    }
  }

  lines.push(
    `Time: ${formatAlertTime()}`,
    "",
    outcome === "T1_HIT"
      ? "Trade remains active • tracking T2 / SL"
      : "Trade completed • Full details → Website History"
  );

  return lines.join("\n");
}


function latestExecutionCandleTime(
  frames,
  mode
) {

  const source =
    mode === "swing"
      ? frames?.h1
      : frames?.m15;

  if (
    !Array.isArray(source) ||
    source.length === 0
  ) {
    return null;
  }

  let latest =
    NaN;

  for (const candle of source) {

    const time =
      candleTimeMs(
        candle
      );

    if (
      Number.isFinite(time) &&
      (
        !Number.isFinite(latest) ||
        time > latest
      )
    ) {
      latest = time;
    }
  }

  return Number.isFinite(latest)
    ? new Date(
        latest
      ).toISOString()
    : null;
}


/* === WHY THIS SIGNAL WAS CONFIRMED — read-only evidence capture ===
 *
 * Re-runs the existing pure engines on the execution frame to capture
 * the exact values used during signal generation. Does NOT modify any
 * engine. Does NOT change any threshold, gate, or formula.
 *
 * Failure here must never fail signal generation — returns a graceful
 * error object in that case.
 */
function buildSignalWhy(analysis, frames, mode) {

  try {

    if (!analysis || typeof analysis !== "object") {
      return { version: 1, error: "no_analysis" };
    }

    const execCandles =
      mode === "swing"
        ? (frames && frames.h1)
        : (frames && frames.m15);

    if (!Array.isArray(execCandles) || execCandles.length < 20) {
      return { version: 1, error: "insufficient_execution_candles" };
    }

    const round4 = v => {
      const n = Number(v);
      return Number.isFinite(n) ? Number(n.toFixed(4)) : null;
    };

    const safe = v =>
      (v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v)))
        ? null
        : v;

    // Re-run pure engines on execution frame
    const structure = new MarketStructureEngine().analyze(execCandles);
    const priceAction = new PriceActionEngine().analyze(execCandles, structure);
    const smc = new SmcIctEngine().analyze(execCandles, structure);

    const mtf = analysis.mtf || {};
    const risk = analysis.risk || {};
    const style = analysis.style || {};
    const reasoning = analysis.reasoning || {};

    const frameSnap = f => ({
      structure: f && f.structure ? safe(f.structure) : null,
      direction: f && f.direction ? safe(f.direction) : null,
      quality: f && f.quality ? safe(f.quality) : null
    });

    return {
      version: 1,

      marketStructure: {
        trend: safe(structure.trend),
        lastEvent: safe(structure.lastEvent),
        hh: safe(structure.higherHighs),
        hl: safe(structure.higherLows),
        lh: safe(structure.lowerHighs),
        ll: safe(structure.lowerLows),
        support: round4(structure.support),
        resistance: round4(structure.resistance),
        recentBullScore: safe(structure.bullishRecentScore),
        recentBearScore: safe(structure.bearishRecentScore)
      },

      smc: {
        orderBlock: safe(smc.orderBlock),
        orderBlockQuality: safe(smc.orderBlockQuality),
        orderBlockLow: round4(smc.orderBlockLow),
        orderBlockHigh: round4(smc.orderBlockHigh),
        fvg: safe(smc.fvg),
        fvgStatus: safe(smc.fvgStatus),
        fvgMitigationPercent: round4(smc.fvgMitigationPercent),
        fvgLow: round4(smc.fvgLow),
        fvgHigh: round4(smc.fvgHigh),
        liquiditySweep: safe(smc.liquiditySweep),
        displacement: safe(smc.displacement),
        displacementQuality: safe(smc.displacementQuality),
        displacementRatio: round4(smc.displacementRatio),
        premiumDiscount: safe(smc.premiumDiscount),
        confluenceGrade: safe(smc.confluenceGrade),
        context: safe(smc.context),
        bullishScore: safe(smc.bullishScore),
        bearishScore: safe(smc.bearishScore)
      },

      mtf: {
        daily: frameSnap(mtf.daily),
        fourHour: frameSnap(mtf.fourHour),
        oneHour: frameSnap(mtf.oneHour),
        fifteenMinute: frameSnap(mtf.fifteenMinute),
        higherTimeframeBias: safe(mtf.higherTimeframeBias),
        alignment: safe(mtf.alignment),
        lowerTimeframeState: safe(mtf.lowerTimeframeState),
        executionState: safe(mtf.executionState),
        confidence: safe(mtf.confidence),
        weightedBull: safe(mtf.bullishScore),
        weightedBear: safe(mtf.bearishScore)
      },

      priceAction: {
        candleDirection: safe(priceAction.candleDirection),
        candleStrength: safe(priceAction.candleStrength),
        rejection: safe(priceAction.rejection),
        breakout: safe(priceAction.breakout),
        momentum: safe(priceAction.momentum),
        bodyPercent: round4(priceAction.bodyPercent),
        upperWickPercent: round4(priceAction.upperWickPercent),
        lowerWickPercent: round4(priceAction.lowerWickPercent)
      },

      risk: {
        entryLow: round4(risk.entryLow),
        entryHigh: round4(risk.entryHigh),
        entryReference: round4(risk.entryReference),
        stopLoss: round4(risk.stopLoss),
        target1: round4(risk.target1),
        target2: round4(risk.target2),
        rr1: round4(risk.rr1),
        rr2: round4(risk.rr2),
        atr: round4(risk.atr),
        atrPercent: round4(risk.atrPercent),
        volatility: safe(risk.volatility),
        directionalContext: safe(risk.directionalContext),
        setupQuality: safe(risk.setupQuality),
        decision: safe(risk.decision),
        reason: safe(risk.reason)
      },

      finalCheck: {
        stylePlanStatus:
          (style.plan && style.plan.status) ||
          safe(style.decision),
        riskDecision: safe(risk.decision),
        candidateLevelValid: safe(risk.decision) === "TRADE-CANDIDATE",
        finalBias: safe(reasoning.finalBias),
        finalState: safe(reasoning.finalState),
        confidence: safe(reasoning.confidence),
        missingConfirmation: safe(reasoning.missingConfirmation)
      }
    };

  } catch (e) {

    return {
      version: 1,
      error: "engine_rerun_failed",
      errorMessage: String((e && e.message) || e)
    };
  }
}


function buildHistoryRecord(
  market,
  mode,
  analysis,
  frames
) {

  const risk =
    analysis.risk || {};

  const style =
    analysis.style || {};

  const mtf =
    analysis.mtf || {};

  const reasoning =
    analysis.reasoning || {};

  return {
    symbol:
      market.symbol,

    marketType:
      market.type,

    exchange:
      market.exchange || "",

    dataSource:
      DATA_SOURCE,

    engineVersion:
      ENGINE_VERSION,

    dataAsOf:
      latestExecutionCandleTime(
        frames,
        mode
      ),

    mode,

    styleLabel:
      modeLabel(mode),

    direction:
      style.bias ||
      risk.directionalContext ||
      reasoning.finalBias ||
      "UNKNOWN",

    executionTimeframe:
      risk.executionTimeframe ||
      (
        mode === "swing"
          ? "1H"
          : "15m"
      ),

    entryLow:
      Number.isFinite(
        Number(risk.entryLow)
      )
        ? Number(risk.entryLow)
        : null,

    entryHigh:
      Number.isFinite(
        Number(risk.entryHigh)
      )
        ? Number(risk.entryHigh)
        : null,

    entryReference:
      Number.isFinite(
        Number(risk.entryReference)
      )
        ? Number(risk.entryReference)
        : null,

    stopLoss:
      Number.isFinite(
        Number(risk.stopLoss)
      )
        ? Number(risk.stopLoss)
        : null,

    target1:
      Number.isFinite(
        Number(risk.target1)
      )
        ? Number(risk.target1)
        : null,

    target2:
      Number.isFinite(
        Number(risk.target2)
      )
        ? Number(risk.target2)
        : null,

    rr1:
      Number.isFinite(
        Number(risk.rr1)
      )
        ? Number(risk.rr1)
        : null,

    rr2:
      Number.isFinite(
        Number(risk.rr2)
      )
        ? Number(risk.rr2)
        : null,

    setupQuality:
      Number(
        risk.setupQuality
      ) || 0,

    volatility:
      risk.volatility ||
      "UNKNOWN",

    styleDecision:
      style.decision ||
      style.plan?.status ||
      "UNKNOWN",

    styleReason:
      style.reason ||
      "",

    styleNextCondition:
      style.nextCondition ||
      "",

    riskDecision:
      risk.decision ||
      "UNKNOWN",

    riskReason:
      risk.reason ||
      "",

    mtfExecutionState:
      mtf.executionState ||
      "",

    higherTimeframeBias:
      mtf.higherTimeframeBias ||
      "",

    alignment:
      mtf.alignment ||
      "",

    mtfConfidence:
      mtf.confidence ||
      "",

    weightedBull:
      Number(
        mtf.bullishScore
      ) || 0,

    weightedBear:
      Number(
        mtf.bearishScore
      ) || 0,

    finalBias:
      reasoning.finalBias ||
      "",

    finalState:
      reasoning.finalState ||
      "",

    confidence:
      reasoning.confidence ||
      "",

    thesis:
      reasoning.thesis ||
      "",

    supportingEvidence:
      reasoning.supportingEvidence ||
      "",

    conflictingEvidence:
      reasoning.conflictingEvidence ||
      "",

    missingConfirmation:
      reasoning.missingConfirmation ||
      "",

    reasoningNextCondition:
      reasoning.nextCondition ||
      "",

    invalidation:
      reasoning.invalidation ||
      "",

    note:
      "Setup Quality is an engine score, not a guaranteed win probability.",

    signalWhy:
      buildSignalWhy(
        analysis,
        frames,
        mode
      )
  };
}



function candleTimeMs(
  candle
) {

  if (!candle) {
    return NaN;
  }

  const raw =
    candle.datetime ??
    candle.time ??
    candle.timestamp ??
    candle.date;

  if (
    raw === undefined ||
    raw === null
  ) {
    return NaN;
  }

  if (
    typeof raw === "number" ||
    /^\d+(?:\.\d+)?$/.test(
      String(raw)
    )
  ) {

    const n =
      Number(raw);

    if (!Number.isFinite(n)) {
      return NaN;
    }

    return n < 1e12
      ? n * 1000
      : n;
  }

  const text =
    String(raw)
      .trim();


  /*
   * Twelve Data is requested with timezone=UTC,
   * but returns datetime strings without a zone,
   * e.g. "2026-09-18 17:45:00".
   *
   * Parse those explicitly as UTC instead of
   * allowing the device/local timezone to shift
   * the candle time.
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {

    return Date.parse(
      text +
      "T00:00:00Z"
    );
  }


  if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(
      text
    )
  ) {

    return Date.parse(
      text
        .replace(
          " ",
          "T"
        ) +
      "Z"
    );
  }


  return Date.parse(
    text
  );
}


function shouldEvaluateOutcomeCandle(
  openMs,
  sentMs,
  intervalMs,
  nowMs = Date.now()
) {

  if (
    !Number.isFinite(openMs) ||
    !Number.isFinite(sentMs) ||
    !Number.isFinite(intervalMs) ||
    !Number.isFinite(nowMs) ||
    intervalMs <= 0
  ) {
    return false;
  }


  /*
   * Candle must begin at/after the signal.
   * This excludes the candle that was already
   * in progress when the signal was generated.
   *
   * Candle must also be fully closed.
   */
  return Boolean(
    openMs >= sentMs &&
    openMs + intervalMs <= nowMs
  );
}


function terminalOutcome(
  outcome
) {

  return [
    "T2_HIT",
    "SL_HIT",
    "AMBIGUOUS",
    "INVALIDATED",
    "EXPIRED",
    "STYLE_CHANGED"
  ].includes(
    String(outcome || "")
      .toUpperCase()
  );
}


function calculateTheoreticalMaxR(
  record,
  high,
  low
) {

  if (!record) {
    return 0;
  }


  const entry =
    Number(
      record.entryReference
    );

  const stop =
    Number(
      record.stopLoss
    );

  const candleHigh =
    Number(high);

  const candleLow =
    Number(low);


  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(stop) ||
    !Number.isFinite(candleHigh) ||
    !Number.isFinite(candleLow)
  ) {
    return 0;
  }


  const riskDistance =
    Math.abs(
      entry -
      stop
    );


  if (
    !Number.isFinite(riskDistance) ||
    riskDistance <= 0
  ) {
    return 0;
  }


  const direction =
    String(
      record.direction || ""
    ).toUpperCase();


  let favorableMove =
    0;


  if (
    direction.includes(
      "BULLISH"
    )
  ) {

    favorableMove =
      candleHigh -
      entry;

  } else if (
    direction.includes(
      "BEARISH"
    )
  ) {

    favorableMove =
      entry -
      candleLow;

  } else {

    return 0;
  }


  const value =
    Math.max(
      0,
      favorableMove /
        riskDistance
    );


  return Number(
    value.toFixed(4)
  );
}


function isAmbiguousOutcomeCandle(
  hitSL,
  hitT1,
  hitT2,
  t1AlreadyHit
) {

  if (!hitSL) {
    return false;
  }

  /*
   * Stop + T2 in the same candle is always ambiguous
   * because OHLC cannot reveal which happened first.
   */
  if (hitT2) {
    return true;
  }

  /*
   * Stop + T1 is ambiguous only when T1 had NOT
   * already been confirmed on an earlier candle.
   */
  return Boolean(
    hitT1 &&
    !t1AlreadyHit
  );
}


function trackSignalOutcome(
  frames,
  historyId
) {

  if (!historyId) {
    return null;
  }

  const record =
    getSignalHistoryById(
      historyId
    );

  if (
    !record ||
    terminalOutcome(
      record.outcome
    )
  ) {
    return record;
  }


  const direction =
    String(
      record.direction || ""
    ).toUpperCase();

  const bullish =
    direction.includes(
      "BULLISH"
    );

  const bearish =
    direction.includes(
      "BEARISH"
    );

  if (
    !bullish &&
    !bearish
  ) {
    return record;
  }


  const stopLoss =
    Number(
      record.stopLoss
    );

  const target1 =
    Number(
      record.target1
    );

  const target2 =
    Number(
      record.target2
    );

  if (
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(target1) ||
    !Number.isFinite(target2)
  ) {
    return record;
  }


  const sentMs =
    Date.parse(
      record.sentAt || ""
    );

  if (
    !Number.isFinite(sentMs)
  ) {
    return record;
  }


  const source =
    record.mode === "swing"
      ? frames.h1
      : frames.m15;


  const candleIntervalMs =
    record.mode === "swing"
      ? 60 * 60 * 1000
      : 15 * 60 * 1000;


  const nowMs =
    Date.now();


  if (
    !Array.isArray(source)
  ) {
    return record;
  }


  /*
   * Only fully post-signal CLOSED candles
   * are evaluated.
   *
   * If a signal arrives while a candle is already
   * open, that candle is skipped because its OHLC
   * cannot tell us whether a target/stop touch
   * happened before or after the signal.
   */
  const candles =
    source
      .map(
        candle => ({
          candle,
          time:
            candleTimeMs(
              candle
            )
        })
      )
      .filter(
        item =>
          shouldEvaluateOutcomeCandle(
            item.time,
            sentMs,
            candleIntervalMs,
            nowMs
          )
      )
      .sort(
        (a, b) =>
          a.time -
          b.time
      );


  if (
    candles.length === 0
  ) {
    return record;
  }


  const savedT1Ms = Date.parse(record.t1HitAt || "");
  let t1HitAt = null;

  let highest =
    record.highestPriceSeen != null &&
    record.highestPriceSeen !== "" &&
    Number.isFinite(
      Number(
        record.highestPriceSeen
      )
    )
      ? Number(
          record.highestPriceSeen
        )
      : null;

  let lowest =
    record.lowestPriceSeen != null &&
    record.lowestPriceSeen !== "" &&
    Number.isFinite(
      Number(
        record.lowestPriceSeen
      )
    )
      ? Number(
          record.lowestPriceSeen
        )
      : null;

  let maxR =
    Number(
      record.maxRReached
    ) || 0;

  let changed =
    false;


  for (
    const item of candles
  ) {

    const candle = item.candle;

    // Restore saved T1 only when it precedes this candle.
    if (!t1HitAt && Number.isFinite(savedT1Ms) &&
        savedT1Ms > sentMs && savedT1Ms <= item.time) {
      t1HitAt = record.t1HitAt;
    }

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      open <= 0 || high <= 0 ||
      low <= 0 || close <= 0 ||
      high < low ||
      high < open ||
      high < close ||
      low > open ||
      low > close
    ) {
      continue;
    }


    if (
      highest === null ||
      high > highest
    ) {
      highest = high;
      changed = true;
    }

    if (
      lowest === null ||
      low < lowest
    ) {
      lowest = low;
      changed = true;
    }


    const theoreticalR =
      calculateTheoreticalMaxR(
        record,
        high,
        low
      );


    if (
      theoreticalR >
      maxR
    ) {

      maxR =
        theoreticalR;

      changed =
        true;
    }


    const hitSL =
      bullish
        ? low <= stopLoss
        : high >= stopLoss;

    const hitT1 =
      bullish
        ? high >= target1
        : low <= target1;

    const hitT2 =
      bullish
        ? high >= target2
        : low <= target2;


    const eventMs =
      item.time +
      candleIntervalMs;


    const eventTime =
      new Date(
        eventMs
      ).toISOString();


    /*
     * OHLC candles do not reveal intrabar order.
     * If stop and target are touched in the same
     * candle, do not guess which happened first.
     */
    if (
      isAmbiguousOutcomeCandle(
        hitSL,
        hitT1,
        hitT2,
        Boolean(
          t1HitAt
        )
      )
    ) {

      const __demoAmbiguous = updateSignalHistory(
        historyId,
        {
          status:
            "INACTIVE",

          outcome: "AMBIGUOUS",

          t1HitAt,

          outcomeAt:
            eventTime,

          outcomeTrackingMethod:
            "CLOSED_CANDLE_CONFIRMATION",

          outcomeTimePrecision:
            "CANDLE_CLOSE_APPROX",

          closedAt:
            eventTime,

          closedReason:
            "Stop and target were touched inside the same candle; intrabar order is unknown.",

          highestPriceSeen:
            highest,

          lowestPriceSeen:
            lowest,

          maxRReached:
            maxR,

          outcomeR:
            null,

          durationMinutes:
            Math.max(
              0,
              Math.round(
                (
                  eventMs -
                  sentMs
                ) /
                60000
              )
            )
        }
      );
      notifyDemoOutcome(__demoAmbiguous);
      return __demoAmbiguous;
    }


    if (
      hitT2
    ) {

      const __demoT2 = updateSignalHistory(
        historyId,
        {
          status:
            "INACTIVE",

          outcome:
            "T2_HIT",

          outcomeAt:
            eventTime,

          outcomeTrackingMethod:
            "CLOSED_CANDLE_CONFIRMATION",

          outcomeTimePrecision:
            "CANDLE_CLOSE_APPROX",

          t1HitAt:
            t1HitAt ||
            eventTime,

          t2HitAt:
            eventTime,

          closedAt:
            eventTime,

          closedReason:
            "Target 2 reached",

          highestPriceSeen:
            highest,

          lowestPriceSeen:
            lowest,

          maxRReached:
            maxR,

          /*
           * This represents target distance in R,
           * not guaranteed realized account profit.
           */
          outcomeR:
            Number(
              record.rr2
            ) || null,

          durationMinutes:
            Math.max(
              0,
              Math.round(
                (
                  eventMs -
                  sentMs
                ) /
                60000
              )
            )
        }
      );
      notifyDemoOutcome(__demoT2);
      return __demoT2;
    }


    if (
      hitSL
    ) {

      const __demoSL = updateSignalHistory(
        historyId,
        {
          status:
            "INACTIVE",

          outcome:
            "SL_HIT",

          /* Preserve earlier T1 touch */
          t1HitAt,

          outcomeAt:
            eventTime,

          outcomeTrackingMethod:
            "CLOSED_CANDLE_CONFIRMATION",

          outcomeTimePrecision:
            "CANDLE_CLOSE_APPROX",

          slHitAt:
            eventTime,

          closedAt:
            eventTime,

          closedReason:
            t1HitAt
              ? "Stop reached after Target 1 had already been touched"
              : "Stop Loss reached",

          highestPriceSeen:
            highest,

          lowestPriceSeen:
            lowest,

          maxRReached:
            maxR,

          outcomeR:
            t1HitAt
              ? null
              : -1,

          slReason:
            deriveSlReason(
              {
                direction: record.direction,
                stopLoss: record.stopLoss,
                t1HitAt,
                invalidation: record.invalidation
              },
              { symbol: record.symbol, type: record.marketType || "", exchange: record.exchange || "" }
            ),

          durationMinutes:
            Math.max(
              0,
              Math.round(
                (
                  eventMs -
                  sentMs
                ) /
                60000
              )
            )
        }
      );
      notifyDemoOutcome(__demoSL);
      return __demoSL;
    }


    if (
      hitT1 &&
      !t1HitAt
    ) {

      t1HitAt =
        eventTime;

      /*
       * maxR is already calculated from the candle's
       * actual favorable excursion above.
       */
      changed = true;
    }
  }


  if (changed) {

    const __demoFinal = updateSignalHistory(
      historyId,
      {
        outcome:
          t1HitAt
            ? "T1_HIT"
            : "OPEN",

        outcomeTrackingMethod:
          "CLOSED_CANDLE_CONFIRMATION",

        outcomeTimePrecision:
          "CANDLE_CLOSE_APPROX",

        t1HitAt,

        highestPriceSeen:
          highest,

        lowestPriceSeen:
          lowest,

        maxRReached:
          maxR
      }
    );
    notifyDemoOutcome(__demoFinal);
    return __demoFinal;
  }


  return record;
}



function directionalSide(
  value
) {

  const text =
    String(
      value || ""
    ).toUpperCase();

  if (
    text.includes(
      "BULLISH"
    )
  ) {
    return "BULLISH";
  }

  if (
    text.includes(
      "BEARISH"
    )
  ) {
    return "BEARISH";
  }

  return "UNKNOWN";
}


function isMaterialSetupChange(
  previousRecord,
  analysis
) {

  if (
    !previousRecord ||
    !analysis ||
    !analysis.risk
  ) {
    return false;
  }


  const risk =
    analysis.risk;

  const currentDirection =
    directionalSide(
      analysis.style?.bias ||
      risk.directionalContext ||
      analysis.reasoning?.finalBias
    );

  const previousDirection =
    directionalSide(
      previousRecord.direction
    );


  /*
   * Direction reversal is always a new setup.
   */
  if (
    currentDirection !== "UNKNOWN" &&
    previousDirection !== "UNKNOWN" &&
    currentDirection !==
      previousDirection
  ) {
    return true;
  }


  const currentEntry =
    Number(
      risk.entryReference
    );

  const previousEntry =
    Number(
      previousRecord.entryReference
    );

  const currentStop =
    Number(
      risk.stopLoss
    );

  const previousStop =
    Number(
      previousRecord.stopLoss
    );

  const currentT1 =
    Number(
      risk.target1
    );

  const previousT1 =
    Number(
      previousRecord.target1
    );

  const currentT2 =
    Number(
      risk.target2
    );

  const previousT2 =
    Number(
      previousRecord.target2
    );

  const atr =
    Math.abs(
      Number(
        risk.atr
      )
    );


  if (
    ![
      currentEntry,
      previousEntry,
      currentStop,
      previousStop,
      currentT1,
      previousT1,
      currentT2,
      previousT2
    ].every(
      Number.isFinite
    )
  ) {
    return false;
  }


  /*
   * Threshold adapts to both volatility and price.
   *
   * Tiny normal movement must NOT create repeated alerts.
   */
  const priceBase =
    Math.max(
      Math.abs(
        currentEntry
      ),
      Math.abs(
        previousEntry
      ),
      1e-8
    );

  const structuralThreshold =
    Math.max(
      Number.isFinite(atr)
        ? atr * 0.35
        : 0,
      priceBase * 0.0005,
      1e-8
    );

  const planThreshold =
    Math.max(
      Number.isFinite(atr)
        ? atr * 0.25
        : 0,
      priceBase * 0.0003,
      1e-8
    );


  const stopChanged =
    Math.abs(
      currentStop -
      previousStop
    ) >=
      structuralThreshold;

  const entryChanged =
    Math.abs(
      currentEntry -
      previousEntry
    ) >=
      planThreshold;

  const t1Changed =
    Math.abs(
      currentT1 -
      previousT1
    ) >=
      planThreshold;

  const t2Changed =
    Math.abs(
      currentT2 -
      previousT2
    ) >=
      planThreshold;


  /*
   * Structural SL must change as well as at least
   * one trade-plan level. This prevents ordinary
   * current-price drift from creating duplicate alerts.
   */
  return Boolean(
    stopChanged &&
    (
      entryChanged ||
      t1Changed ||
      t2Changed
    )
  );
}


function selectStrongestCandidate(
  candidates,
  previous,
  marginOverride
) {

  if (
    !Array.isArray(candidates) ||
    candidates.length === 0
  ) {
    return null;
  }


  const sorted =
    [...candidates].sort(
      (a, b) =>
        b.quality -
          a.quality ||
        b.rr1 -
          a.rr1 ||
        b.rr2 -
          a.rr2
    );


  const best =
    sorted[0];


  if (
    !previous ||
    !previous.active ||
    !previous.mode
  ) {
    return best;
  }


  const current =
    sorted.find(
      candidate =>
        candidate.mode ===
        previous.mode
    );


  /*
   * Current style is no longer a valid candidate.
   * Switch immediately to the best remaining style.
   */
  if (!current) {
    return best;
  }


  /*
   * Current style is already strongest.
   */
  if (
    best.mode ===
    current.mode
  ) {
    return current;
  }


  const envMargin =
    Number(
      process.env
        .TELEGRAM_STYLE_SWITCH_MARGIN
    );

  const requestedMargin =
    Number(
      marginOverride
    );


  const margin =
    Number.isFinite(
      requestedMargin
    ) &&
    requestedMargin >= 0
      ? requestedMargin
      : (
          Number.isFinite(
            envMargin
          ) &&
          envMargin >= 0
            ? envMargin
            : 8
        );


  /*
   * Hysteresis:
   * challenger must beat the currently active
   * valid style by at least the configured margin.
   */
  if (
    best.quality >=
      current.quality +
        margin
  ) {
    return best;
  }


  return current;
}


async function scanMarket(
  fetchTwelveCandles,
  market
) {

  const earlyPairKey =
    market.symbol;

  const earlyState =
    watcherState.alerts[
      earlyPairKey
    ];

  if (
    earlyState?.pendingOutcomeAlert &&
    earlyState?.lastHistoryId
  ) {

    const pendingRecord =
      getSignalHistoryById(
        earlyState.lastHistoryId
      );

    const pendingOutcome =
      String(
        earlyState.pendingOutcomeAlert
      ).toUpperCase();

    if (
      pendingRecord &&
      [
        "T2_HIT",
        "SL_HIT"
      ].includes(
        pendingOutcome
      ) &&
      String(
        pendingRecord.outcome ||
        ""
      ).toUpperCase() ===
        pendingOutcome
    ) {

      const pendingText =
        buildOutcomeAlert(
          pendingRecord,
          market.symbol
        );

      try {

        const telegramResult =
          await sendTelegram(
            pendingText
          );

        watcherState.alerts[
          earlyPairKey
        ] = {
          ...earlyState,
          pendingOutcomeAlert:
            null,
          lastOutcomeAlert:
            pendingOutcome,
          lastOutcomeAlertAt:
            new Date()
              .toISOString(),
          lastOutcomeTelegramMessageId:
            telegramResult?.message_id ??
            null
        };

        console.log(
          `[Telegram Watcher] ${market.symbol} pending ${pendingOutcome} Telegram alert sent • message_id=${telegramResult?.message_id ?? "unknown"}`
        );

      } catch (error) {

        console.error(
          `[Telegram Watcher] ${market.symbol} pending ${pendingOutcome} Telegram retry failed:`,
          error.message
        );
      }

    } else {

      watcherState.alerts[
        earlyPairKey
      ] = {
        ...earlyState,
        pendingOutcomeAlert:
          null
      };
    }
  }

  const frames =
    await getFrames(
      fetchTwelveCandles,
      market
    );

  const candidates = [];

  for (const mode of ["scalping", "intraday", "swing"]) {

    const analysis =
      analyzeMode(
        frames,
        mode
      );

    if (
      isTradeCandidate(
        analysis
      )
    ) {

      candidates.push({
        mode,
        analysis,

        quality:
          Number(
            analysis.risk
              .setupQuality
          ) || 0,

        rr1:
          Number(
            analysis.risk
              .rr1
          ) || 0,

        rr2:
          Number(
            analysis.risk
              .rr2
          ) || 0
      });
    }
  }


  const pairKey =
    market.symbol;


  const legacyActive =
    MODES.some(
      mode =>
        watcherState
          .alerts[
            `${market.symbol}|${mode}`
          ]?.active
    );


  const previous =
    watcherState.alerts[
      pairKey
    ] || {
      active:
        legacyActive
    };


  let outcomeRecord =
    null;

  if (
    previous.historyId
  ) {

    outcomeRecord =
      trackSignalOutcome(
        frames,
        previous.historyId
      );
  }


  const currentOutcome =
    String(
      outcomeRecord?.outcome ||
      ""
    ).toUpperCase();

  const outcomeAlertNeeded =
    Boolean(
      previous.historyId &&
      [
        "T1_HIT",
        "T2_HIT",
        "SL_HIT"
      ].includes(currentOutcome) &&
      previous.lastOutcomeAlert !==
        currentOutcome
    );


  let outcomeAlertSent =
    false;

  if (
    outcomeAlertNeeded
  ) {

    const outcomeText =
      buildOutcomeAlert(
        outcomeRecord,
        market.symbol
      );

    try {

      const telegramResult =
        await sendTelegram(
          outcomeText
        );

      outcomeAlertSent =
        true;

      watcherState.alerts[
        pairKey
      ] = {
        ...previous,

        lastOutcomeAlert:
          currentOutcome,

        lastOutcomeAlertAt:
          new Date()
            .toISOString(),

        lastOutcomeTelegramMessageId:
          telegramResult?.message_id ??
          null
      };

      console.log(
        `[Telegram Watcher] ${market.symbol} ${currentOutcome} Telegram alert sent • message_id=${telegramResult?.message_id ?? "unknown"}`
      );

    } catch (error) {

      console.error(
        `[Telegram Watcher] ${market.symbol} outcome Telegram failed:`,
        error.message
      );
    }
  }


  const closedByOutcome =
    Boolean(
      previous.active &&
      outcomeRecord &&
      outcomeRecord.status ===
        "INACTIVE" &&
      terminalOutcome(
        outcomeRecord.outcome
      )
    );


  if (closedByOutcome) {

    watcherState.alerts[
      pairKey
    ] = {
      active: false,
      historyId: null,
      rearmRequired: true,

      lastHistoryId:
        previous.historyId ||
        null,

      terminalOutcome:
        outcomeRecord.outcome ||
        "UNKNOWN",

      pendingOutcomeAlert:
        (
          [
            "T2_HIT",
            "SL_HIT"
          ].includes(
            String(
              outcomeRecord.outcome ||
              ""
            ).toUpperCase()
          ) &&
          !outcomeAlertSent
        )
          ? String(
              outcomeRecord.outcome
            ).toUpperCase()
          : null,

      lastOutcomeAlert:
        outcomeAlertSent
          ? String(
              outcomeRecord.outcome ||
              ""
            ).toUpperCase()
          : previous.lastOutcomeAlert ||
            null,

      lastOutcomeAlertAt:
        outcomeAlertSent
          ? new Date()
              .toISOString()
          : previous.lastOutcomeAlertAt ||
            null,

      resetAt:
        new Date()
          .toISOString()
    };


    for (const mode of MODES) {

      delete watcherState
        .alerts[
          `${market.symbol}|${mode}`
        ];
    }


    console.log(
      `[Telegram Watcher] ${market.symbol} ${outcomeRecord.outcome} • waiting for setup reset before re-arm`
    );

    return;
  }


  if (
    candidates.length === 0
  ) {

    if (
      previous.rearmRequired
    ) {

      watcherState.alerts[
        pairKey
      ] = {
        active: false,
        historyId: null,
        rearmRequired: false,

        rearmedAt:
          new Date()
            .toISOString()
      };


      for (const mode of MODES) {

        delete watcherState
          .alerts[
            `${market.symbol}|${mode}`
          ];
      }


      console.log(
        `[Telegram Watcher] ${market.symbol} setup reset confirmed • pair re-armed`
      );

      return;
    }

    if (
      previous.active &&
      previous.historyId
    ) {

      /*
       * The trade already sent to Telegram remains
       * active even if the current analysis temporarily
       * stops qualifying as a TRADE-CANDIDATE.
       *
       * Do not abandon or replace that trade here.
       * trackSignalOutcome() continues monitoring its
       * original T1 / T2 / Stop Loss levels.
       */
      watcherState.alerts[
        pairKey
      ] = {
        ...(watcherState.alerts[pairKey] || previous),

        active: true,

        updatedAt:
          new Date()
            .toISOString()
      };


      console.log(
        `[Telegram Watcher] ${market.symbol} existing trade still open • waiting for T2 / SL outcome`
      );

      return;
    }


    for (const mode of MODES) {

      delete watcherState
        .alerts[
          `${market.symbol}|${mode}`
        ];
    }

    return;
  }


  if (
    previous.rearmRequired
  ) {

    watcherState.alerts[
      pairKey
    ] = {
      ...previous,
      active: false,
      historyId: null,
      rearmRequired: true,

      updatedAt:
        new Date()
          .toISOString()
    };


    for (const mode of MODES) {

      delete watcherState
        .alerts[
          `${market.symbol}|${mode}`
        ];
    }

    return;
  }


  const strongest =
    selectStrongestCandidate(
      candidates,
      previous
    );

  let historyId =
    previous.historyId ||
    null;


  const modeChanged =
    Boolean(
      previous.active &&
      previous.mode &&
      previous.mode !==
        strongest.mode
    );


  const previousRecord =
    previous.historyId
      ? getSignalHistoryById(
          previous.historyId
        )
      : null;


  const setupChanged =
    Boolean(
      previous.active &&
      !modeChanged &&
      previous.mode ===
        strongest.mode &&
      isMaterialSetupChange(
        previousRecord,
        strongest.analysis
      )
    );


  if (
    previous.active &&
    previous.historyId &&
    (setupChanged || modeChanged)
  ) {

    console.log(
      `[Telegram Watcher] ${market.symbol} new setup/style ignored • existing trade still open until T2 / SL`
    );

    return;

  } else if (setupChanged) {

    const text =
      buildAlert(
        market,
        strongest.mode,
        strongest.analysis
      );


    /*
     * Send first.
     * If Telegram fails, keep the old setup active
     * so the watcher can retry safely later.
     */
    await sendTelegram(
      text
    );


    if (
      previous.historyId
    ) {

      closeSignalHistory(
        previous.historyId,
        {
          outcome:
            "SETUP_REPLACED",

          closedReason:
            "Same style produced a materially new Entry / Stop Loss / Target plan"
        }
      );
    }


    const historyEntry =
      addSignalHistory(
        buildHistoryRecord(
          market,
          strongest.mode,
          strongest.analysis,
          frames
        )
      );


    historyId =
      historyEntry.id;

    notifyDemoNewSignal(historyEntry);


    console.log(
      `[Telegram Watcher] NEW SETUP ${market.symbol} ${strongest.mode} • material Entry/SL/Target change • quality ${strongest.quality}`
    );


  } else if (modeChanged) {

    const text =
      buildAlert(
        market,
        strongest.mode,
        strongest.analysis
      );


    /*
     * A genuine strongest-style change is a new setup.
     * Send Telegram first so a delivery failure does not
     * close or replace the currently active setup.
     */
    await sendTelegram(
      text
    );


    if (
      previous.historyId
    ) {

      closeSignalHistory(
        previous.historyId,
        {
          outcome:
            "STYLE_CHANGED",

          closedReason:
            "Strongest style changed from " +
            modeLabel(
              previous.mode
            ) +
            " to " +
            modeLabel(
              strongest.mode
            )
        }
      );
    }


    const historyEntry =
      addSignalHistory(
        buildHistoryRecord(
          market,
          strongest.mode,
          strongest.analysis,
          frames
        )
      );

    historyId =
      historyEntry.id;

    notifyDemoNewSignal(historyEntry);


    console.log(
      `[Telegram Watcher] STYLE CHANGE ALERT ${market.symbol} ${previous.mode} -> ${strongest.mode} • quality ${strongest.quality}`
    );

  } else if (
    !previous.active
  ) {

    const text =
      buildAlert(
        market,
        strongest.mode,
        strongest.analysis
      );

    await sendTelegram(
      text
    );


    const historyEntry =
      addSignalHistory(
        buildHistoryRecord(
          market,
          strongest.mode,
          strongest.analysis,
          frames
        )
      );

    historyId =
      historyEntry.id;

    notifyDemoNewSignal(historyEntry);


    console.log(
      `[Telegram Watcher] STRONGEST ALERT ${market.symbol} ${strongest.mode} • quality ${strongest.quality}`
    );
  }


  watcherState.alerts[
    pairKey
  ] = {
    ...(watcherState.alerts[pairKey] || {}),

    active: true,

    historyId,

    mode:
      strongest.mode,

    quality:
      strongest.quality,

    rr1:
      strongest.rr1,

    rr2:
      strongest.rr2,

    updatedAt:
      new Date()
        .toISOString()
  };


  for (const mode of MODES) {

    delete watcherState
      .alerts[
        `${market.symbol}|${mode}`
      ];
  }
}


function startTelegramTradeWatcher({
  fetchTwelveCandles
}) {

  if (started) {
    return;
  }

  started = true;

  watcherHealth.started =
    true;

  watcherHealth.startedAt =
    new Date()
      .toISOString();

  watcherHealth.enabled =
    false;

  const token =
    String(
      process.env
        .TELEGRAM_BOT_TOKEN ||
      ""
    ).trim();

  const chatId =
    String(
      process.env
        .TELEGRAM_CHAT_ID ||
      ""
    ).trim();

  if (
    !token ||
    !chatId
  ) {

    console.log(
      "[Telegram Watcher] Disabled — Telegram credentials missing"
    );

    return;
  }

  if (
    typeof fetchTwelveCandles !==
    "function"
  ) {

    console.log(
      "[Telegram Watcher] Disabled — candle fetch function unavailable"
    );

    return;
  }

  watcherHealth.enabled =
    true;


  console.log(
    `[Telegram Watcher] Ready — ${WATCH_MARKETS.length} pairs • 3 styles • ${DAILY_CREDIT_BUDGET} credit/day watcher budget`
  );


  const upstoxMarkets =
    WATCH_MARKETS.filter(
      market =>
        ["NSE", "BSE"].includes(
          String(
            market.exchange || ""
          ).trim().toUpperCase()
        )
    );

  const twelveDataMarkets =
    WATCH_MARKETS.filter(
      market =>
        !["NSE", "BSE"].includes(
          String(
            market.exchange || ""
          ).trim().toUpperCase()
        )
    );

  let twelveDataIndex = 0;


  const recordSuccessfulScan =
    market => {

      try {

        const key =
          recoveryMarketKey(market);

        const nowIso =
          new Date()
            .toISOString();

        if (
          !watcherState
            .lastSuccessfulScanAtByMarket ||
          typeof watcherState
            .lastSuccessfulScanAtByMarket !==
            "object"
        ) {
          watcherState
            .lastSuccessfulScanAtByMarket =
              {};
        }

        watcherState
          .lastSuccessfulScanAtByMarket[
            key
          ] = nowIso;

        watcherState.lastSuccessfulScanAt =
          nowIso;

      } catch (e) {

        console.error(
          "[Telegram Watcher] recordSuccessfulScan failed:",
          e.message
        );
      }
    };


  const scanOneMarket =
    async market => {

      watcherHealth.currentMarket =
        `${market.symbol}${market.exchange ? ` • ${market.exchange}` : ""}`;

      try {

        console.log(
          `[Telegram Watcher] Scan ${market.symbol}${market.exchange ? ` • ${market.exchange}` : ""}`
        );

        await scanMarket(
          fetchTwelveCandles,
          market
        );

        recordSuccessfulScan(
          market
        );

        return true;

      } catch (error) {

        console.error(
          `[Telegram Watcher] ${market.symbol}${market.exchange ? ` • ${market.exchange}` : ""} failed:`,
          error.message
        );

        return false;
      }
    };


  /* === RECOVERY: historical replay + outcome check === */

  const checkRecoveryOutcome =
    (frames, candidate) => {

      const risk =
        candidate.analysis.risk || {};

      const style =
        candidate.analysis.style || {};

      const direction =
        String(
          style.bias ||
          risk.directionalContext ||
          ""
        ).toUpperCase();

      const bullish =
        direction.includes("BULLISH");

      const bearish =
        direction.includes("BEARISH");

      if (!bullish && !bearish) {
        return { outcome: "NO_SETUP" };
      }

      const sl =
        Number(risk.stopLoss);

      const t1 =
        Number(risk.target1);

      const t2 =
        Number(risk.target2);

      if (
        !Number.isFinite(sl) ||
        !Number.isFinite(t1)
      ) {
        return { outcome: "WAIT" };
      }

      const source =
        candidate.mode === "swing"
          ? frames.h1
          : frames.m15;

      const intervalMs =
        candidate.mode === "swing"
          ? 60 * 60 * 1000
          : 15 * 60 * 1000;

      const sentMs =
        candidate.candleMs +
        intervalMs;

      const nowMs =
        Date.now();

      const postCandles =
        source
          .map(candle => ({
            candle,
            time: candleTimeMs(candle)
          }))
          .filter(x =>
            Number.isFinite(x.time) &&
            shouldEvaluateOutcomeCandle(
              x.time,
              sentMs,
              intervalMs,
              nowMs
            )
          )
          .sort((a, b) => a.time - b.time);

      if (postCandles.length === 0) {
        return { outcome: "WAIT" };
      }

      let t1HitAt = null;

      for (const item of postCandles) {

        const high =
          Number(item.candle.high);

        const low =
          Number(item.candle.low);

        if (
          !Number.isFinite(high) ||
          !Number.isFinite(low)
        ) {
          continue;
        }

        const hitSL =
          bullish
            ? low <= sl
            : high >= sl;

        const hitT1 =
          bullish
            ? high >= t1
            : low <= t1;

        const hitT2 =
          Number.isFinite(t2)
            ? (bullish ? high >= t2 : low <= t2)
            : false;

        const eventTime =
          new Date(
            item.time + intervalMs
          ).toISOString();

        if (
          isAmbiguousOutcomeCandle(
            hitSL,
            hitT1,
            hitT2,
            Boolean(t1HitAt)
          )
        ) {
          return {
            outcome: "AMBIGUOUS",
            t1HitAt,
            outcomeAt: eventTime,
            slReason:
              "SL and target were both touched within the same candle; intrabar order is unknown."
          };
        }

        if (hitT2) {
          return {
            outcome: "T2_HIT",
            t1HitAt: t1HitAt || eventTime,
            t2HitAt: eventTime,
            outcomeAt: eventTime
          };
        }

        if (hitSL) {
          return {
            outcome: "SL_HIT",
            t1HitAt,
            slHitAt: eventTime,
            outcomeAt: eventTime,
            slReason:
              deriveSlReason(
                {
                  direction,
                  stopLoss: sl,
                  t1HitAt,
                  invalidation:
                    (candidate.analysis &&
                      candidate.analysis.reasoning &&
                      candidate.analysis.reasoning.invalidation) ||
                    ""
                },
                {
                  symbol: candidate.market
                    ? candidate.market.symbol
                    : "",
                  type: candidate.market
                    ? candidate.market.type
                    : "",
                  exchange: candidate.market
                    ? candidate.market.exchange
                    : ""
                }
              )
          };
        }

        if (hitT1 && !t1HitAt) {
          t1HitAt = eventTime;
        }
      }

      if (t1HitAt) {
        return {
          outcome: "T1_HIT",
          t1HitAt
        };
      }

      return { outcome: "WAIT" };
    };


  const formatRecoveryTime =
    iso => {

      if (!iso) return "--";

      try {
        return new Intl.DateTimeFormat(
          "en-IN",
          {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          }
        ).format(
          new Date(iso)
        ) + " IST";
      } catch {
        return iso;
      }
    };


  const buildRecoveryReport =
    (summary) => {

      const lines = [];

      lines.push("━━━━━━━━━━━━━━━━");
      lines.push("🔄 OFFLINE RECOVERY REPORT");
      lines.push("━━━━━━━━━━━━━━━━");
      lines.push("");

      lines.push(
        "Offline period:"
      );
      lines.push(
        formatRecoveryTime(summary.windowStartIso) +
        " → " +
        formatRecoveryTime(summary.windowEndIso)
      );
      lines.push("");

      if (summary.partialReason) {
        lines.push("⚠️ " + summary.partialReason);
        lines.push("");
      }

      lines.push("Markets checked:");
      lines.push(
        "• " + summary.marketsChecked + "/" +
        summary.marketsTotal +
        " within schedule window"
      );
      lines.push("");

      lines.push("Missed/Recovered Events:");

      let anyEvent = false;

      for (const r of summary.marketResults) {

        if (r.status === "skipped_schedule") {
          continue;
        }

        anyEvent = true;

        const label =
          r.market.symbol +
          (r.market.exchange
            ? " • " + r.market.exchange
            : "");

        if (r.status === "insufficient") {
          lines.push(
            "• " + label + " — DATA INSUFFICIENT"
          );
          continue;
        }

        if (r.status === "non_recoverable") {
          lines.push(
            "• " + label + " — UNAVAILABLE (" +
            (r.error || "provider rejected") + ")"
          );
          continue;
        }

        if (r.status === "error" || r.status === "network_error") {
          lines.push(
            "• " + label + " — ERROR (" +
            (r.error || "unknown") + ")"
          );
          continue;
        }

        if (
          r.status === "no_candles_in_window" ||
          r.candidates.length === 0
        ) {
          lines.push(
            "• " + label + " — NO SETUP / WAIT"
          );
          continue;
        }

        const last =
          r.candidates[r.candidates.length - 1];

        const risk =
          last.analysis.risk || {};

        const style =
          last.analysis.style || {};

        const dir =
          style.bias ||
          risk.directionalContext ||
          "UNKNOWN";

        const oc =
          last.outcome && last.outcome.outcome ||
          "WAIT";

        lines.push(
          "• " + label + " — " +
          dir + " setup candidate"
        );

        if (Number.isFinite(Number(risk.entryReference))) {
          lines.push(
            "  Entry: " + risk.entryReference
          );
        }
        if (Number.isFinite(Number(risk.stopLoss))) {
          lines.push(
            "  SL: " + risk.stopLoss
          );
        }
        if (Number.isFinite(Number(risk.target1))) {
          lines.push(
            "  T1: " + risk.target1
          );
        }
        if (Number.isFinite(Number(risk.target2))) {
          lines.push(
            "  T2: " + risk.target2
          );
        }

        lines.push(
          "  Result: " + oc
        );

        if (
          oc === "SL_HIT" ||
          oc === "AMBIGUOUS"
        ) {

          const reason =
            (last.outcome &&
              last.outcome.slReason) ||
            "";

          if (reason) {
            lines.push(
              "  Reason: " + reason
            );
          }
        }
      }

      if (!anyEvent) {
        lines.push("• No markets were active during gap.");
      }

      lines.push("");
      lines.push("Summary:");

      const counts = summary.counts;

      lines.push(
        "Signals reconstructed: " +
        counts.candidates
      );
      lines.push("T1: " + counts.t1);
      lines.push("T2: " + counts.t2);
      lines.push("SL: " + counts.sl);
      lines.push("Invalidated: " + counts.invalidated);
      lines.push("No setup/WAIT: " + counts.wait);

      lines.push("");
      lines.push(
        "Current live scan resumed: YES"
      );
      lines.push("");
      lines.push("━━━━━━━━━━━━━━━━");

      return lines.join("\n");
    };


  const recoveryCounts = (results) => {

    const counts = {
      candidates: 0,
      t1: 0,
      t2: 0,
      sl: 0,
      invalidated: 0,
      wait: 0
    };

    for (const r of results) {

      if (r.status !== "ok") continue;

      if (r.candidates.length === 0) {
        counts.wait++;
        continue;
      }

      counts.candidates += r.candidates.length;

      for (const cand of r.candidates) {

        const oc =
          cand.outcome && cand.outcome.outcome;

        if (oc === "T1_HIT") counts.t1++;
        else if (oc === "T2_HIT") counts.t2++;
        else if (oc === "SL_HIT") counts.sl++;
        else if (oc === "AMBIGUOUS") counts.invalidated++;
        else counts.wait++;
      }
    }

    return counts;
  };


  const runRecovery =
    async () => {

      /* Only run at most once per Node process boot + gap */
      if (recoveryInFlight) return;
      recoveryInFlight = true;

      try {

        const nowMs = Date.now();

        const perMarket =
          watcherState.lastSuccessfulScanAtByMarket || {};

        /* Find markets with gap >= threshold */
        const candidates = [];

        for (const market of WATCH_MARKETS) {

          const key =
            recoveryMarketKey(market);

          const lastIso =
            perMarket[key] ||
            watcherState.lastSuccessfulScanAt;

          if (!lastIso) {
            continue; /* no baseline yet */
          }

          const lastMs =
            Date.parse(lastIso);

          if (!Number.isFinite(lastMs)) continue;

          const gapMs =
            nowMs - lastMs;

          if (gapMs < RECOVERY_GAP_THRESHOLD_MS) {
            continue;
          }

          candidates.push({
            market,
            key,
            lastMs
          });
        }

        if (candidates.length === 0) {
          return;
        }

        /* Compute window per market (capped at 24h) */
        const minLastMs =
          Math.min(...candidates.map(c => c.lastMs));

        const windowStartMs =
          Math.max(
            minLastMs,
            nowMs - RECOVERY_MAX_WINDOW_MS
          );

        const windowEndMs = nowMs;

        const windowStartIso =
          new Date(windowStartMs).toISOString();

        const windowEndIso =
          new Date(windowEndMs).toISOString();

        const partialReason =
          (nowMs - minLastMs) > RECOVERY_MAX_WINDOW_MS
            ? "PARTIAL — gap exceeded 24h, recovering latest 24h only"
            : null;

        /* Deterministic recovery IDs per market */
        const marketResults = [];
        let dedupedAll = true;

        for (const cand of candidates) {

          const recoveryId =
            cand.key + "-" +
            new Date(cand.lastMs).toISOString() + "-" +
            windowEndIso;

          const processed =
            Array.isArray(
              watcherState.recovery
                ?.processedRecoveryIds
            )
              ? watcherState.recovery.processedRecoveryIds
              : [];

          if (processed.includes(recoveryId)) {
            continue;
          }

          dedupedAll = false;

          const active =
            isMarketActiveInWindow(
              cand.market,
              cand.lastMs,
              windowEndMs
            );

          if (!active) {
            marketResults.push({
              market: cand.market,
              key: cand.key,
              status: "skipped_schedule",
              candidates: [],
              recoveryId
            });
            continue;
          }

          const r =
            await runRecoveryScanForMarket(
              cand.market,
              cand.lastMs,
              windowEndMs
            );

          r.recoveryId = recoveryId;
          marketResults.push(r);
        }

        if (dedupedAll) {
          return; /* all already processed */
        }

        const counts =
          recoveryCounts(marketResults);

        const summary = {
          windowStartIso,
          windowEndIso,
          partialReason,
          marketsChecked:
            marketResults.filter(
              r => r.status !== "skipped_schedule"
            ).length,
          marketsTotal: candidates.length,
          marketResults,
          counts
        };

        const reportText =
          buildRecoveryReport(summary);

        try {
          await sendTelegram(reportText);
          console.log(
            "[Telegram Watcher] OFFLINE RECOVERY REPORT sent"
          );
        } catch (e) {
          console.error(
            "[Telegram Watcher] recovery report send failed:",
            e.message
          );
        }

        /* Mark processed */
        if (
          !watcherState.recovery ||
          typeof watcherState.recovery !== "object"
        ) {
          watcherState.recovery = {};
        }

        const processedList =
          Array.isArray(
            watcherState.recovery.processedRecoveryIds
          )
            ? watcherState.recovery.processedRecoveryIds
            : [];

        for (const r of marketResults) {

          if (r.recoveryId) {
            processedList.push(r.recoveryId);
          }
        }

        /* keep last 200 ids */
        watcherState.recovery.processedRecoveryIds =
          processedList.slice(-200);

        watcherState.recovery.lastRecoveryAt =
          windowEndIso;
        watcherState.recovery.lastRecoveryStart =
          windowStartIso;
        watcherState.recovery.lastRecoveryEnd =
          windowEndIso;
        watcherState.recovery.lastRecoveryId =
          marketResults
            .map(r => r.recoveryId)
            .filter(Boolean)
            .join("|");
        watcherState.recovery.lastRecoveryStatus =
          partialReason ? "partial" : "completed";

        saveState();

      } catch (error) {

        console.error(
          "[Telegram Watcher] recovery failed:",
          error.message
        );

      } finally {

        recoveryInFlight = false;
      }
    };


  const runRecoveryScanForMarket =
    async (market, windowStartMs, windowEndMs) => {

      const result = {
        market,
        key: recoveryMarketKey(market),
        windowStartMs,
        windowEndMs,
        status: "ok",
        candidates: [],
        error: null
      };

      try {

        const frames =
          await getFrames(
            fetchTwelveCandles,
            market
          );

        const execSource =
          frames.m15;

        if (
          !Array.isArray(execSource) ||
          execSource.length < 20
        ) {
          result.status = "insufficient";
          return result;
        }

        /* Collect candidate scan points: candle closes inside window */
        const intervalMs =
          15 * 60 * 1000;

        const points = [];

        for (const candle of execSource) {

          const t =
            candleTimeMs(candle);

          if (!Number.isFinite(t)) continue;

          const closeMs =
            t + intervalMs;

          if (
            closeMs < windowStartMs ||
            closeMs > windowEndMs
          ) {
            continue;
          }

          points.push({
            candleMs: t,
            closeMs
          });
        }

        if (points.length === 0) {
          result.status = "no_candles_in_window";
          return result;
        }

        /* Chronological replay */
        for (const pt of points) {

          const sliced = {
            m15: frames.m15.filter(
              x => candleTimeMs(x) <= pt.candleMs
            ),
            h1: frames.h1.filter(
              x => candleTimeMs(x) <= pt.candleMs
            ),
            h4: frames.h4.filter(
              x => candleTimeMs(x) <= pt.candleMs
            ),
            d1: frames.d1.filter(
              x => candleTimeMs(x) <= pt.candleMs
            )
          };

          if (sliced.m15.length < 20) continue;

          let found = null;

          for (const mode of ["scalping", "intraday", "swing"]) {

            let analysis;

            try {
              analysis = analyzeMode(
                sliced,
                mode
              );
            } catch {
              continue;
            }

            if (
              !isTradeCandidate(analysis)
            ) {
              continue;
            }

            found = {
              mode,
              candleMs: pt.candleMs,
              analysis
            };

            break;
          }

          if (found) {

            found.outcome =
              checkRecoveryOutcome(
                frames,
                found
              );

            result.candidates.push(
              found
            );
          }
        }

        return result;

      } catch (error) {

        result.status =
          isNetworkLikeError(error)
            ? "network_error"
            : isNonRecoverableError(error)
              ? "non_recoverable"
              : "error";

        result.error =
          error.message;

        return result;
      }
    };


  const runUpstoxCycle =
    async () => {

      // India scanning is disabled temporarily.
      // Re-enable later by setting ENABLE_INDIA_SCANNING=true.
      if (process.env.ENABLE_INDIA_SCANNING !== "true") {
        return;
      }

      let successful = 0;

      console.log(
        `[Telegram Watcher] India full scan started — ${upstoxMarkets.length} markets`
      );

      for (
        const market of upstoxMarkets
      ) {

        if (
          await scanOneMarket(
            market
          )
        ) {
          successful += 1;
        }
      }

      watcherHealth.lastTickError =
        successful ===
        upstoxMarkets.length
          ? null
          : `${upstoxMarkets.length - successful} India market scan(s) failed`;

      saveState();

      console.log(
        `[Telegram Watcher] India full scan completed — ${successful}/${upstoxMarkets.length} successful`
      );
    };


  const isTwelveDataWatcherOpen =
    () => {

      const hour =
        Number(
          new Intl.DateTimeFormat(
            "en-GB",
            {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              hourCycle: "h23"
            }
          )
            .format(
              new Date()
            )
        );

      return (
        hour >= 7 &&
        hour < 24
      );
    };


  const runTwelveDataCycle =
    async () => {

      if (
        twelveDataMarkets.length === 0
      ) {
        return;
      }

      if (
        !isTwelveDataWatcherOpen()
      ) {
        return;
      }

      resetDailyBudgetIfNeeded();

      if (
        !budgetAvailable()
      ) {

        console.log(
          `[Telegram Watcher] Twelve Data watcher budget reached (${watcherState.watcherCredits}/${DAILY_CREDIT_BUDGET})`
        );

        void maybeNotifyBudgetExhausted();

        return;
      }

      const market =
        twelveDataMarkets[
          twelveDataIndex %
          twelveDataMarkets.length
        ];

      twelveDataIndex =
        (
          twelveDataIndex + 1
        ) %
        twelveDataMarkets.length;

      await scanOneMarket(
        market
      );

      saveState();
    };


  const guardedRun =
    task => {

      runWatcherTickExclusive(
        async () => {

          watcherHealth.lastTickStartedAt =
            new Date()
              .toISOString();

          try {

            await task();

          } finally {

            watcherHealth.lastTickCompletedAt =
              new Date()
                .toISOString();

            watcherHealth.currentMarket =
              null;
          }
        }
      )
        .then(
          ran => {

            if (!ran) {

              console.log(
                "[Telegram Watcher] Previous scan still running • overlapping scan skipped"
              );
            }
          }
        )
        .catch(
          error => {

            watcherHealth.lastTickError =
              error.message ||
              "Watcher scan failed";

            console.error(
              "[Telegram Watcher] Tick failed:",
              error.message
            );
          }
        );
    };


  const isIndiaMarketOpen =
    () => {

      const parts =
        new Intl.DateTimeFormat(
          "en-GB",
          {
            timeZone: "Asia/Kolkata",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
          }
        )
          .formatToParts(
            new Date()
          )
          .reduce(
            (result, part) => {
              result[part.type] =
                part.value;
              return result;
            },
            {}
          );

      if (
        ["Sat", "Sun"].includes(
          parts.weekday
        )
      ) {
        return false;
      }

      const minutes =
        Number(parts.hour) * 60 +
        Number(parts.minute);

      return (
        minutes >= 9 * 60 + 15 &&
        minutes < 15 * 60 + 30
      );
    };


  const guardedIndiaRun =
    async () => {

      if (!isIndiaMarketOpen()) {
        return;
      }

      if (indiaTickRunning) {

        console.log(
          "[Telegram Watcher] Previous India scan still running • overlapping India scan skipped"
        );

        return;
      }

      indiaTickRunning = true;

      try {

        await runUpstoxCycle();

      } catch (error) {

        watcherHealth.lastTickError =
          error.message ||
          "India watcher scan failed";

        console.error(
          "[Telegram Watcher] India tick failed:",
          error.message
        );

      } finally {

        indiaTickRunning = false;
      }
    };


  setTimeout(
    () =>
      guardedIndiaRun(),
    15 * 1000
  );

  setInterval(
    () =>
      guardedIndiaRun(),
    ROTATION_MS
  );


  setTimeout(
    () =>
      guardedRun(
        runTwelveDataCycle
      ),
    45 * 1000
  );

  setInterval(
    () =>
      guardedRun(
        runTwelveDataCycle
      ),
    60 * 1000
  );


  /* === OFFLINE RECOVERY: run once at boot after warm-up === */
  setTimeout(
    () =>
      runRecovery()
        .catch(err =>
          console.error(
            "[Telegram Watcher] recovery boot error:",
            err.message
          )
        ),
    70 * 1000
  );
}

async function runEndToEndSelfTest() {

  let historyId =
    null;

  const historyIds =
    [];

  const now =
    Date.now() -
    (60 * 60 * 1000);

  const candle = (
    offset,
    open,
    high,
    low,
    close
  ) => ({
    datetime:
      new Date(
        now + offset
      ).toISOString(),
    open,
    high,
    low,
    close
  });


  const market = {
    symbol:
      "SELFTEST/USD",

    type:
      "test",

    exchange:
      "SELF-TEST"
  };


  const analysis = {

    style: {
      bias:
        "BULLISH",

      plan: {
        status:
          "TRADE-CANDIDATE"
      },

      reason:
        "Controlled end-to-end system test",

      nextCondition:
        "None — synthetic test"
    },

    risk: {
      decision:
        "TRADE-CANDIDATE",

      directionalContext:
        "BULLISH",

      setupQuality:
        99,

      executionTimeframe:
        "15m",

      entryLow:
        100,

      entryHigh:
        101,

      entryReference:
        100.5,

      stopLoss:
        99,

      target1:
        102.75,

      target2:
        104.25,

      rr1:
        1.5,

      rr2:
        2.5,

      riskReward:
        2.5,

      volatility:
        "SELF-TEST",

      reason:
        "Synthetic risk plan"
    },

    mtf: {
      executionState:
        "SELF-TEST",

      higherTimeframeBias:
        "BULLISH",

      alignment:
        "SELF-TEST",

      confidence:
        "SELF-TEST",

      bullishScore:
        100,

      bearishScore:
        0
    },

    reasoning: {
      finalBias:
        "BULLISH",

      finalState:
        "TRADE-CANDIDATE",

      confidence:
        "SELF-TEST",

      thesis:
        "Synthetic controlled test",

      supportingEvidence:
        "Synthetic candle data",

      conflictingEvidence:
        "None",

      missingConfirmation:
        "None",

      nextCondition:
        "T1 then T2",

      invalidation:
        "Synthetic SL"
    }
  };


  const baseFrames = {

    m15: [
      candle(
        -60000,
        100,
        101,
        100,
        100.5
      )
    ],

    h1: [
      candle(
        -3600000,
        100,
        101,
        100,
        100.5
      )
    ],

    h4: [
      candle(
        -14400000,
        100,
        101,
        100,
        100.5
      )
    ],

    d1: [
      candle(
        -86400000,
        100,
        101,
        100,
        100.5
      )
    ]
  };


  try {

    // Safety: self-test validates alert text locally; never sends Telegram messages.
    const sendTelegram = async (text) => {
      if (typeof text !== "string" || !text.trim()) {
        throw new Error("Self-test alert formatting produced empty text");
      }

      console.log(
        "[SELF-TEST] Alert text validated locally; Telegram delivery skipped."
      );

      return { message_id: null };
    };

    console.log(
      "SELF-TEST 1/7: Alert formatting (Telegram delivery disabled)..."
    );

    await sendTelegram(
      "🧪 TEST ONLY — DO NOT TRADE\n\n" +
      buildAlert(
        market,
        "intraday",
        analysis
      )
    );


    console.log(
      "SELF-TEST 2/7: History entry..."
    );

    const entry =
      addSignalHistory({
        ...buildHistoryRecord(
          market,
          "intraday",
          analysis,
          baseFrames
        ),
        sentAt:
          new Date(now)
            .toISOString()
      });

    historyId =
      entry.id;

    historyIds.push(
      historyId
    );


    console.log(
      "SELF-TEST 3/7: T1 outcome..."
    );

    trackSignalOutcome(
      {
        ...baseFrames,

        m15: [
          candle(
            2000,
            100.5,
            103,
            100.2,
            102.9
          )
        ]
      },
      historyId
    );

    const afterT1 =
      getSignalHistoryById(
        historyId
      );

    if (
      afterT1?.outcome !==
        "T1_HIT"
    ) {
      throw new Error(
        "T1 tracker verification failed"
      );
    }

    await sendTelegram(
      "🧪 TEST ONLY — DO NOT TRADE\n\n" +
      buildOutcomeAlert(
        afterT1,
        market.symbol
      )
    );


    console.log(
      "SELF-TEST 4/7: T2 outcome..."
    );

    trackSignalOutcome(
      {
        ...baseFrames,

        m15: [
          candle(
            2000,
            100.5,
            103,
            100.2,
            102.9
          ),

          candle(
            4000,
            102,
            104.5,
            101.8,
            104.3
          )
        ]
      },
      historyId
    );

    const afterT2 =
      getSignalHistoryById(
        historyId
      );

    if (
      afterT2?.outcome !==
        "T2_HIT" ||
      afterT2?.status !==
        "INACTIVE"
    ) {
      throw new Error(
        "T2 tracker verification failed"
      );
    }

    await sendTelegram(
      "🧪 TEST ONLY — DO NOT TRADE\n\n" +
      buildOutcomeAlert(
        afterT2,
        market.symbol
      )
    );


    console.log(
      "SELF-TEST 5/7: SL outcome..."
    );

    const slEntry =
      addSignalHistory({
        ...buildHistoryRecord(
          market,
          "intraday",
          analysis,
          baseFrames
        ),
        sentAt:
          new Date(now)
            .toISOString()
      });

    historyIds.push(
      slEntry.id
    );

    trackSignalOutcome(
      {
        ...baseFrames,

        m15: [
          candle(
            6000,
            100.5,
            100.8,
            98.8,
            99
          )
        ]
      },
      slEntry.id
    );

    const afterSL =
      getSignalHistoryById(
        slEntry.id
      );

    if (
      afterSL?.outcome !==
        "SL_HIT" ||
      afterSL?.status !==
        "INACTIVE"
    ) {
      throw new Error(
        "SL tracker verification failed"
      );
    }

    await sendTelegram(
      "🧪 TEST ONLY — DO NOT TRADE\n\n" +
      buildOutcomeAlert(
        afterSL,
        market.symbol
      )
    );


    console.log(
      "SELF-TEST 6/7: Statistics..."
    );

    const stats =
      getSignalHistoryStats();

    if (
      !stats ||
      !stats.summary ||
      stats.summary.total < 1
    ) {
      throw new Error(
        "Statistics verification failed"
      );
    }


    console.log(
      "SELF-TEST 7/7: Lifetime export..."
    );

    const exported =
      exportSignalHistory();

    if (
      !exported.some(
        row =>
          row.id === historyId
      )
    ) {
      throw new Error(
        "Export verification failed"
      );
    }


    console.log(
      "END-TO-END SELF-TEST PASSED ✅"
    );

    console.log(
      "Alert formatting ✅ (Telegram delivery skipped) History ✅ T1 ✅ T2 ✅ SL ✅ Statistics ✅ Export ✅"
    );

    return true;

  } finally {

    for (const id of historyIds) {

      deleteSignalHistory(
        id
      );
    }

    if (historyIds.length) {

      console.log(
        "SELF-TEST HISTORY CLEANED ✅"
      );
    }
  }
}

module.exports = {
  startTelegramTradeWatcher,
  runEndToEndSelfTest,
  deriveSlReason,
  buildSignalWhy,
  maybeNotifyBudgetExhausted,
  currentIstDay,
  recoveryMarketKey,
  isNetworkLikeError,
  isNonRecoverableError,
  isIndiaMarketTime,
  isTwelveDataMarketTime,
  isMarketActiveInWindow,
  isMaterialSetupChange,
  selectStrongestCandidate,
  candleTimeMs,
  shouldEvaluateOutcomeCandle,
  isAmbiguousOutcomeCandle,
  calculateTheoreticalMaxR,
  runWatcherTickExclusive,
  normalizeMarketIndex,
  readStateFromPaths,
  writeStateAtomic,
  fetchWithTimeout,
  getTelegramWatcherStatus
};
