require("dotenv").config();

const TWELVE_DATA_KEYS = [
  process.env.TWELVE_DATA_API_KEY,
  process.env.TWELVE_DATA_API_KEY_2,
  process.env.TWELVE_DATA_API_KEY_3
].filter(k => k && k.trim() !== "");

let activeKeyIndex = 0;
let lastRotationTime = Date.now();
const ROTATION_INTERVAL_MS = 8 * 60 * 60 * 1000;

function getActiveKey() {
  if (TWELVE_DATA_KEYS.length <= 1) return TWELVE_DATA_KEYS[0] || "";
  const now = Date.now();
  if (now - lastRotationTime >= ROTATION_INTERVAL_MS) {
    activeKeyIndex = (activeKeyIndex + 1) % TWELVE_DATA_KEYS.length;
    lastRotationTime = now;
    console.log("[Twelve Data] 8 Hours completed. Rotated to API key #" + (activeKeyIndex + 1));
  }
  return TWELVE_DATA_KEYS[activeKeyIndex];
}


const {
  WebSocketServer,
  WebSocket
} = require("ws");

const express =
  require("express");

const path =
  require("path");

const fs =
  require("fs");

const {
  listSignalHistory,
  getSignalHistoryStats,
  exportSignalHistory
} = require("./signal-history");


const app =
  express();

const PORT =
  process.env.PORT ||
  3000;


const HOST =
  String(
    process.env.HOST ||
    "127.0.0.1"
  ).trim() ||
  "127.0.0.1";

const CACHE_TTL =
  10 * 60 * 1000;

const marketCache =
  new Map();

const API_RATE_WINDOW_MS =
  60 * 1000;

const API_RATE_MAX =
  120;

const MAX_RATE_CLIENTS =
  500;

const apiRateState =
  new Map();


function validateMarketInput(
  symbol,
  exchange = ""
) {

  const cleanSymbol =
    String(symbol || "")
      .trim()
      .toUpperCase();

  let cleanExchange =
    String(exchange || "")
      .trim()
      .toUpperCase();


  if (
    cleanExchange ===
      "COINBASE"
  ) {

    cleanExchange =
      "COINBASE PRO";
  }


  if (
    !cleanSymbol ||
    cleanSymbol.length > 40 ||
    !/^[A-Z0-9._:/^-]+$/.test(
      cleanSymbol
    )
  ) {

    throw new Error(
      "Invalid symbol"
    );
  }


  if (
    cleanExchange.length > 40 ||
    (
      cleanExchange &&
      !/^[A-Z0-9._ -]+$/.test(
        cleanExchange
      )
    )
  ) {

    throw new Error(
      "Invalid exchange"
    );
  }


  return {
    symbol:
      cleanSymbol,

    exchange:
      cleanExchange
  };
}


function apiRateLimiter(
  req,
  res,
  next
) {

  const now =
    Date.now();

  const key =
    String(
      req.ip ||
      req.socket
        ?.remoteAddress ||
      "unknown"
    );


  let state =
    apiRateState.get(
      key
    );


  if (
    !state ||
    now -
      state.windowStart >=
      API_RATE_WINDOW_MS
  ) {

    state = {
      windowStart:
        now,

      count:
        0
    };
  }


  state.count++;


  apiRateState.delete(
    key
  );

  apiRateState.set(
    key,
    state
  );


  while (
    apiRateState.size >
      MAX_RATE_CLIENTS
  ) {

    const oldestKey =
      apiRateState.keys()
        .next()
        .value;

    if (
      oldestKey ===
        undefined
    ) {
      break;
    }

    apiRateState.delete(
      oldestKey
    );
  }


  if (
    state.count >
      API_RATE_MAX
  ) {

    const retryAfter =
      Math.max(
        1,
        Math.ceil(
          (
            state.windowStart +
            API_RATE_WINDOW_MS -
            now
          ) /
          1000
        )
      );


    res.set(
      "Retry-After",
      String(
        retryAfter
      )
    );


    return res
      .status(429)
      .json({
        ok: false,

        error:
          "Too many API requests. Please retry shortly."
      });
  }


  next();
}


const INTERVAL_MS = {
  "15min":
    15 * 60 * 1000,

  "1h":
    60 * 60 * 1000,

  "4h":
    4 * 60 * 60 * 1000,

  "1day":
    24 * 60 * 60 * 1000
};


const CACHE_CLOSE_GRACE =
  5000;

const MAX_MARKET_CACHE_ENTRIES =
  120;

const MAX_CURRENT_CANDLE_CACHE_ENTRIES =
  120;


function cacheExpiryForInterval(
  interval,
  savedAt = Date.now()
) {

  const duration =
    INTERVAL_MS[
      interval
    ];

  if (!duration) {

    return (
      savedAt +
      CACHE_TTL
    );
  }


  /*
   * Never keep a closed-candle response
   * beyond the next candle close.
   * A small grace period lets the data
   * provider publish the newly closed bar.
   */
  const nextClose =
    (
      Math.floor(
        savedAt /
        duration
      ) + 1
    ) *
      duration +
    CACHE_CLOSE_GRACE;


  return Math.min(
    savedAt +
      CACHE_TTL,
    nextClose
  );
}


function setBoundedCache(
  cache,
  key,
  value,
  maxEntries
) {

  if (
    cache.has(
      key
    )
  ) {

    cache.delete(
      key
    );
  }


  cache.set(
    key,
    value
  );


  while (
    cache.size >
      maxEntries
  ) {

    const oldestKey =
      cache.keys()
        .next()
        .value;

    if (
      oldestKey ===
        undefined
    ) {
      break;
    }

    cache.delete(
      oldestKey
    );
  }
}

app.use(
  express.json({
    limit:
      "32kb"
  })
);


app.use(
  "/api",
  apiRateLimiter
);

app.get("/", (req, res) => {
  res.redirect("/report.html");
});

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    ),
    {
      setHeaders:
        (
          res,
          filePath
        ) => {

          if (
            /\.(?:html|js|css)$/i.test(
              filePath
            )
          ) {

            res.setHeader(
              "Cache-Control",
              "no-store, no-cache, must-revalidate"
            );

            res.setHeader(
              "Pragma",
              "no-cache"
            );
          }
        }
    }
  )
);



/* === UPSTOX TOKEN STORAGE === */

const UPSTOX_TOKEN_FILE =
  path.join(
    __dirname,
    ".upstox-token.json"
  );


function loadUpstoxToken() {

  try {

    if (
      !fs.existsSync(
        UPSTOX_TOKEN_FILE
      )
    ) {
      return;
    }

    const data =
      JSON.parse(
        fs.readFileSync(
          UPSTOX_TOKEN_FILE,
          "utf8"
        )
      );

    const token =
      String(
        data.access_token ||
        ""
      ).trim();

    if (token) {

      process.env.UPSTOX_ACCESS_TOKEN =
        token;

      console.log(
        "[Upstox] Saved token loaded"
      );
    }

  } catch (error) {

    console.error(
      "[Upstox] Saved token load failed:",
      error?.message || error
    );
  }
}


function saveUpstoxToken(
  token
) {

  const cleanToken =
    String(
      token || ""
    ).trim();

  if (!cleanToken) {

    throw new Error(
      "Cannot save empty Upstox token"
    );
  }

  const tempFile =
    UPSTOX_TOKEN_FILE +
    ".tmp";

  fs.writeFileSync(
    tempFile,
    JSON.stringify({
      access_token:
        cleanToken,
      saved_at:
        new Date()
          .toISOString()
    }),
    {
      encoding:
        "utf8",
      mode:
        0o600
    }
  );

  fs.renameSync(
    tempFile,
    UPSTOX_TOKEN_FILE
  );
}


loadUpstoxToken();


/* === UPSTOX OAUTH === */

app.get(
  "/api/upstox/login",
  (req, res) => {

    const clientId =
      String(
        process.env.UPSTOX_API_KEY || ""
      ).trim();

    const redirectUri =
      String(
        process.env.UPSTOX_REDIRECT_URI || ""
      ).trim();

    if (
      !clientId ||
      !redirectUri
    ) {

      return res
        .status(503)
        .json({
          ok: false,
          error:
            "Upstox API key or redirect URI is not configured"
        });
    }

    const params =
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri
      });

    res.redirect(
      "https://api.upstox.com/v2/login/authorization/dialog?" +
      params.toString()
    );
  }
);


app.get(
  "/api/upstox/callback",
  async (req, res) => {

    try {

      const code =
        String(
          req.query.code || ""
        ).trim();

      if (!code) {
        return res
          .status(400)
          .send(
            "Upstox authorization code missing."
          );
      }

      const clientId =
        String(
          process.env.UPSTOX_API_KEY || ""
        ).trim();

      const clientSecret =
        String(
          process.env.UPSTOX_API_SECRET || ""
        ).trim();

      const redirectUri =
        String(
          process.env.UPSTOX_REDIRECT_URI || ""
        ).trim();

      if (
        !clientId ||
        !clientSecret ||
        !redirectUri
      ) {

        return res
          .status(503)
          .send(
            "Upstox server configuration incomplete."
          );
      }

      const body =
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type:
            "authorization_code"
        });

      const response =
        await fetch(
          "https://api.upstox.com/v2/login/authorization/token",
          {
            method: "POST",
            headers: {
              accept:
                "application/json",
              "Content-Type":
                "application/x-www-form-urlencoded"
            },
            body
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.access_token
      ) {

        console.error(
          "[Upstox OAuth] Token exchange failed:",
          response.status,
          data?.errors ||
          data?.status ||
          "unknown error"
        );

        return res
          .status(502)
          .send(
            "Upstox connection failed. Check server logs."
          );
      }

      /*
       * Keep token server-side only.
       * Never expose it to browser.
       */
      process.env.UPSTOX_ACCESS_TOKEN =
        data.access_token;

      saveUpstoxToken(
        data.access_token
      );

      console.log(
        "[Upstox OAuth] Connected successfully"
      );

      res.redirect(
        "/report.html?upstox=connected"
      );

    } catch (error) {

      console.error(
        "[Upstox OAuth]",
        error?.message || error
      );

      res
        .status(500)
        .send(
          "Upstox connection error."
        );
    }
  }
);

app.get(
  "/api/status",
  (req, res) => {

    res.json({
      ok: true,

      apiConfigured:
        Boolean(
          getActiveKey()
        ),

      upstoxConfigured:
        Boolean(
          process.env
            .UPSTOX_ACCESS_TOKEN
        ),

      fundamentalConfigured:
        Boolean(
          process.env
            .TRADING_ECONOMICS_API_KEY
        ),

      freeFundamentals:
        true,

      freeFundamentalSources: [
        "BLS",
        "EUROSTAT",
        "FRED",
        "ECB"
      ],

      cacheMinutes: 10
    });
  }
);



/* === UPSTOX INSTRUMENT RESOLVER === */

const upstoxInstrumentCache =
  new Map();


async function resolveUpstoxInstrument(
  symbol,
  exchange = "NSE"
) {

  const validated =
    validateMarketInput(
      symbol,
      exchange
    );

  const cleanSymbol =
    validated.symbol;

  const cleanExchange =
    validated.exchange ||
    "NSE";

  if (
    cleanExchange !== "NSE" &&
    cleanExchange !== "BSE"
  ) {

    throw new Error(
      "Upstox supports NSE/BSE stocks here"
    );
  }

  const cacheKey =
    cleanExchange +
    "|" +
    cleanSymbol;

  const cached =
    upstoxInstrumentCache.get(
      cacheKey
    );

  if (cached) {
    return cached;
  }

  const token =
    String(
      process.env
        .UPSTOX_ACCESS_TOKEN ||
      ""
    ).trim();

  if (!token) {

    throw new Error(
      "Upstox is not authorized"
    );
  }

  const params =
    new URLSearchParams({
      query:
        cleanSymbol,
      exchanges:
        cleanExchange,
      segments:
        "EQ",
      page_number:
        "1",
      records:
        "30"
    });

  const response =
    await fetch(
      "https://api.upstox.com/v2/instruments/search?" +
        params.toString(),
      {
        headers: {
          Accept:
            "application/json",
          Authorization:
            "Bearer " + token
        }
      }
    );

  let data;

  try {

    data =
      JSON.parse(
        await response.text()
      );

  } catch {

    throw new Error(
      "Upstox instrument search returned invalid data"
    );
  }

  if (
    !response.ok ||
    data.status !== "success" ||
    !Array.isArray(data.data)
  ) {

    throw new Error(
      data?.errors?.[0]?.message ||
      "Upstox instrument search failed"
    );
  }

  const instrument =
    data.data.find(
      item =>
        String(
          item.trading_symbol ||
          ""
        )
          .trim()
          .toUpperCase() ===
          cleanSymbol &&
        String(
          item.exchange ||
          ""
        )
          .trim()
          .toUpperCase() ===
          cleanExchange &&
        String(
          item.segment ||
          ""
        )
          .trim()
          .toUpperCase() ===
          cleanExchange +
          "_EQ" &&
        (
          (
            cleanExchange === "NSE" &&
            String(
              item.instrument_type ||
              ""
            )
              .trim()
              .toUpperCase() ===
              "EQ"
          ) ||
          (
            cleanExchange === "BSE" &&
            String(
              item.instrument_type ||
              ""
            )
              .trim()
              .toUpperCase() ===
              "A"
          )
        )
    );

  if (
    !instrument ||
    !instrument.instrument_key
  ) {

    throw new Error(
      cleanSymbol +
      " " +
      cleanExchange +
      " equity instrument not found on Upstox"
    );
  }

  const result = {
    symbol:
      cleanSymbol,

    exchange:
      cleanExchange,

    instrumentKey:
      String(
        instrument.instrument_key
      ),

    isin:
      String(
        instrument.isin ||
        ""
      ).trim(),

    name:
      String(
        instrument.name ||
        cleanSymbol
      )
  };

  upstoxInstrumentCache.set(
    cacheKey,
    result
  );

  return result;
}


const MARKET_REFERENCE_TTL =
  12 * 60 * 60 * 1000;

const marketReferenceCache =
  new Map();


async function fetchMarketReference(
  type
) {

  const apiKey =
    getActiveKey();


  if (!apiKey) {

    throw new Error(
      "Twelve Data API key is not configured"
    );
  }


  const cached =
    marketReferenceCache.get(
      type
    );


  if (
    cached &&
    Date.now() -
      cached.savedAt <
      MARKET_REFERENCE_TTL
  ) {

    return {
      source:
        "CACHE",

      markets:
        cached.markets
    };
  }


  const endpoint =
    type === "crypto"
      ? "cryptocurrencies"
      : type === "stocks"
        ? "stocks"
        : "forex_pairs";


  const collected =
    [];

  let page =
    1;

  let expectedCount =
    Infinity;


  while (
    page <= 6 &&
    collected.length <
      expectedCount
  ) {

    const params =
      new URLSearchParams({
        apikey:
          apiKey,

        format:
          "JSON",

        page:
          String(page),

        outputsize:
          "5000"
      });


    if (type === "stocks") {
      params.set(
        "country",
        "India"
      );
    }


    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        25000
      );


    let response;

    try {

      response =
        await fetch(
          "https://api.twelvedata.com/" +
            endpoint +
            "?" +
            params.toString(),
          {
            signal:
              controller.signal
          }
        );

    } catch (
      error
    ) {

      if (
        error &&
        error.name ===
          "AbortError"
      ) {

        throw new Error(
          "Market catalog request timed out"
        );
      }

      throw new Error(
        "Market catalog network request failed"
      );

    } finally {

      clearTimeout(
        timeout
      );
    }


    let data;

    try {

      data =
        JSON.parse(
          await response.text()
        );

    } catch {

      throw new Error(
        "Market catalog provider returned invalid data"
      );
    }


    if (
      !response.ok ||
      data.status ===
        "error"
    ) {

      throw new Error(
        data.message ||
        "Market catalog request failed"
      );
    }


    if (
      !Array.isArray(
        data.data
      )
    ) {

      throw new Error(
        "Market catalog data is unavailable"
      );
    }


    expectedCount =
      Number.isFinite(
        Number(
          data.count
        )
      )
        ? Number(
            data.count
          )
        : data.data.length;


    if (
      data.data.length === 0
    ) {
      break;
    }


    collected.push(
      ...data.data
    );


    if (
      data.data.length <
        5000
    ) {
      break;
    }


    page++;
  }


  let markets;


  if (
    type === "crypto"
  ) {

    const pairMap =
      new Map();


    for (
      const row of
        collected
    ) {

      const symbol =
        String(
          row.symbol ||
          ""
        )
          .trim()
          .toUpperCase();


      if (!symbol) {
        continue;
      }


      const exchanges =
        Array.isArray(
          row.available_exchanges
        )
          ? row
              .available_exchanges
              .map(
                value =>
                  String(
                    value ||
                    ""
                  ).trim()
              )
              .filter(
                Boolean
              )
          : [];


      if (
        !pairMap.has(
          symbol
        )
      ) {

        pairMap.set(
          symbol,
          {
            symbol,

            assetType:
              "crypto",

            base:
              String(
                row.currency_base ||
                ""
              ),

            quote:
              String(
                row.currency_quote ||
                ""
              ),

            exchanges:
              []
          }
        );
      }


      const item =
        pairMap.get(
          symbol
        );


      item.exchanges =
        Array.from(
          new Set([
            ...item.exchanges,
            ...exchanges
          ])
        );
    }


    markets =
      Array.from(
        pairMap.values()
      );

  } else if (
    type === "stocks"
  ) {

    const stockMap =
      new Map();


    for (
      const row of
        collected
    ) {

      const symbol =
        String(
          row.symbol ||
          ""
        )
          .trim()
          .toUpperCase();

      const exchange =
        String(
          row.exchange ||
          ""
        )
          .trim()
          .toUpperCase();

      const country =
        String(
          row.country ||
          ""
        )
          .trim();

      if (
        !symbol ||
        (
          exchange !== "NSE" &&
          exchange !== "BSE"
        )
      ) {
        continue;
      }

      const key =
        symbol + "|" + exchange;

      if (
        stockMap.has(
          key
        )
      ) {
        continue;
      }

      stockMap.set(
        key,
        {
          symbol,

          assetType:
            "stocks",

          name:
            String(
              row.name ||
              symbol
            ).trim(),

          group:
            String(
              row.type ||
              "Stock"
            ).trim(),

          base:
            symbol,

          quote:
            String(
              row.currency ||
              "INR"
            )
              .trim()
              .toUpperCase(),

          country,

          exchange,

          exchanges:
            [exchange]
        }
      );
    }


    markets =
      Array.from(
        stockMap.values()
      );

  } else {

    const pairMap =
      new Map();


    for (
      const row of
        collected
    ) {

      const symbol =
        String(
          row.symbol ||
          ""
        )
          .trim()
          .toUpperCase();


      if (
        !symbol ||
        pairMap.has(
          symbol
        )
      ) {
        continue;
      }


      pairMap.set(
        symbol,
        {
          symbol,

          assetType:
            "forex",

          group:
            String(
              row.currency_group ||
              ""
            ),

          base:
            String(
              row.currency_base ||
              ""
            ),

          quote:
            String(
              row.currency_quote ||
              ""
            ),

          exchanges:
            []
        }
      );
    }


    markets =
      Array.from(
        pairMap.values()
      );
  }


  const popularSymbols =
    type === "crypto"
      ? [
          "BTC/USD",
          "ETH/USD",
          "SOL/USD",
          "XRP/USD",
          "BNB/USD",
          "DOGE/USD",
          "ADA/USD",
          "LTC/USD"
        ]
      : type === "stocks"
        ? [
            "RELIANCE",
            "TCS",
            "HDFCBANK",
            "ICICIBANK",
            "INFY",
            "SBIN",
            "BHARTIARTL",
            "ITC"
          ]
        : [
            "EUR/USD",
            "GBP/USD",
            "USD/JPY",
            "USD/CHF",
            "AUD/USD",
            "USD/CAD",
            "NZD/USD",
            "EUR/GBP"
          ];


  const popularRank =
    new Map(
      popularSymbols.map(
        (symbol, index) => [
          symbol,
          index
        ]
      )
    );


  markets.sort(
    (
      a,
      b
    ) => {

      const aRank =
        popularRank.has(
          a.symbol
        )
          ? popularRank.get(
              a.symbol
            )
          : Infinity;

      const bRank =
        popularRank.has(
          b.symbol
        )
          ? popularRank.get(
              b.symbol
            )
          : Infinity;


      if (
        aRank !== bRank
      ) {
        return (
          aRank -
          bRank
        );
      }


      return a.symbol.localeCompare(
        b.symbol
      );
    }
  );


  marketReferenceCache.set(
    type,
    {
      savedAt:
        Date.now(),

      markets
    }
  );


  return {
    source:
      "REST",

    markets
  };
}


app.get(
  "/api/markets",
  async (
    req,
    res
  ) => {

    try {

      const type =
        String(
          req.query.type ||
          "crypto"
        )
          .trim()
          .toLowerCase();


      if (
        type !== "crypto" &&
        type !== "forex" &&
        type !== "stocks"
      ) {

        return res
          .status(400)
          .json({
            ok: false,

            error:
              "Unsupported market type"
          });
      }


      const search =
        String(
          req.query.search ||
          ""
        )
          .trim()
          .toUpperCase()
          .slice(
            0,
            80
          );


      const offset =
        Math.max(
          0,
          Number(
            req.query.offset
          ) || 0
        );


      const limit =
        Math.max(
          20,
          Math.min(
            250,
            Number(
              req.query.limit
            ) || 100
          )
        );


      const result =
        await fetchMarketReference(
          type
        );



      const popularStockSymbols = new Set([
        "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK",
        "INFY", "SBIN", "BHARTIARTL", "ITC"
      ]);

      const availableMarkets = type === "stocks"
        ? result.markets.filter(item =>
            popularStockSymbols.has(
              String(item.symbol || "").trim().toUpperCase()
            )
          )
        : result.markets;

      const filtered =
        search
          ? availableMarkets.filter(
              item => {

                const haystack =
                  [
                    item.symbol,
                    item.name,
                    item.exchange,
                    item.base,
                    item.quote,
                    item.group,
                    ...(
                      item.exchanges ||
                      []
                    )
                  ]
                    .join(
                      " "
                    )
                    .toUpperCase();


                return haystack.includes(
                  search
                );
              }
            )
          : availableMarkets;


      const markets =
        filtered.slice(
          offset,
          offset +
            limit
        );


      res.json({
        ok: true,

        type,

        source:
          result.source,

        total:
          availableMarkets.length,

        matched:
          filtered.length,

        offset,

        limit,

        hasMore:
          offset +
            markets.length <
          filtered.length,

        markets
      });

    } catch (
      error
    ) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Market catalog error"
        });
    }
  }
);



/* =========================================
   FOREX FUNDAMENTAL ENGINE V1
   Economic calendar / macro event layer
   ========================================= */

const FUNDAMENTAL_CACHE_TTL =
  5 * 60 * 1000;

const fundamentalCache =
  new Map();


const US_MACRO_CACHE_TTL =
  30 * 60 * 1000;

let usMacroCache =
  null;


function numericValue(
  value
) {

  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : null;
}


function monthlyObservations(
  series
) {

  return Array.isArray(
    series?.data
  )
    ? series.data
        .filter(
          row =>
            /^M(0[1-9]|1[0-2])$/.test(
              String(
                row.period ||
                ""
              )
            ) &&
            numericValue(
              row.value
            ) !== null
        )
    : [];
}


function findObservation(
  rows,
  year,
  period
) {

  return rows.find(
    row =>
      Number(
        row.year
      ) ===
        Number(
          year
        ) &&
      row.period ===
        period
  ) || null;
}


async function fetchUSMacroSnapshot() {

  if (
    usMacroCache &&
    Date.now() -
      usMacroCache.savedAt <
      US_MACRO_CACHE_TTL
  ) {

    return {
      source:
        "BLS CACHE",

      ...usMacroCache.data
    };
  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;


  try {

    response =
      await fetch(
        "https://api.bls.gov/publicAPI/v1/timeseries/data/",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          },

          body:
            JSON.stringify({
              seriesid: [
                "CUUR0000SA0",
                "LNS14000000",
                "CES0000000001"
              ]
            }),

          signal:
            controller.signal
        }
      );

  } catch (
    error
  ) {

    if (
      error &&
      error.name ===
        "AbortError"
    ) {

      throw new Error(
        "BLS macro request timed out"
      );
    }


    throw new Error(
      "BLS macro network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(
        text
      );

  } catch {

    throw new Error(
      "BLS returned invalid JSON"
    );
  }


  if (
    !response.ok ||
    data.status !==
      "REQUEST_SUCCEEDED"
  ) {

    throw new Error(
      data.message?.[0] ||
      "BLS macro request failed"
    );
  }


  const series =
    Array.isArray(
      data.Results?.series
    )
      ? data.Results.series
      : [];


  const byId =
    new Map(
      series.map(
        item => [
          item.seriesID,
          item
        ]
      )
    );


  const cpiRows =
    monthlyObservations(
      byId.get(
        "CUUR0000SA0"
      )
    );


  const unemploymentRows =
    monthlyObservations(
      byId.get(
        "LNS14000000"
      )
    );


  const payrollRows =
    monthlyObservations(
      byId.get(
        "CES0000000001"
      )
    );


  const latestCpi =
    cpiRows[0] ||
    null;


  const previousCpi =
    cpiRows[1] ||
    null;


  const latestUnemployment =
    unemploymentRows[0] ||
    null;


  const previousUnemployment =
    unemploymentRows[1] ||
    null;


  const latestPayroll =
    payrollRows[0] ||
    null;


  const previousPayroll =
    payrollRows[1] ||
    null;


  let cpiYoY =
    null;

  let previousCpiYoY =
    null;


  if (latestCpi) {

    const yearAgo =
      findObservation(
        cpiRows,
        Number(
          latestCpi.year
        ) - 1,
        latestCpi.period
      );


    if (
      yearAgo &&
      numericValue(
        yearAgo.value
      )
    ) {

      cpiYoY =
        (
          (
            numericValue(
              latestCpi.value
            ) /
            numericValue(
              yearAgo.value
            )
          ) -
          1
        ) * 100;
    }
  }


  if (previousCpi) {

    const previousYearAgo =
      findObservation(
        cpiRows,
        Number(
          previousCpi.year
        ) - 1,
        previousCpi.period
      );


    if (
      previousYearAgo &&
      numericValue(
        previousYearAgo.value
      )
    ) {

      previousCpiYoY =
        (
          (
            numericValue(
              previousCpi.value
            ) /
            numericValue(
              previousYearAgo.value
            )
          ) -
          1
        ) * 100;
    }
  }


  const unemploymentRate =
    latestUnemployment
      ? numericValue(
          latestUnemployment.value
        )
      : null;


  const previousUnemploymentRate =
    previousUnemployment
      ? numericValue(
          previousUnemployment.value
        )
      : null;


  const payrollLevel =
    latestPayroll
      ? numericValue(
          latestPayroll.value
        )
      : null;


  const previousPayrollLevel =
    previousPayroll
      ? numericValue(
          previousPayroll.value
        )
      : null;


  const payrollChangeThousands =
    payrollLevel !== null &&
    previousPayrollLevel !== null
      ? payrollLevel -
        previousPayrollLevel
      : null;


  const snapshot = {
    country:
      "United States",

    currency:
      "USD",

    cpi: {
      index:
        latestCpi
          ? numericValue(
              latestCpi.value
            )
          : null,

      year:
        latestCpi?.year ||
        null,

      period:
        latestCpi?.periodName ||
        null,

      yoyPercent:
        cpiYoY,

      previousYoYPercent:
        previousCpiYoY,

      trend:
        cpiYoY === null ||
        previousCpiYoY === null
          ? "UNKNOWN"
          : cpiYoY >
              previousCpiYoY
            ? "RISING"
            : cpiYoY <
                previousCpiYoY
              ? "FALLING"
              : "FLAT"
    },

    unemployment: {
      ratePercent:
        unemploymentRate,

      previousRatePercent:
        previousUnemploymentRate,

      year:
        latestUnemployment?.year ||
        null,

      period:
        latestUnemployment?.periodName ||
        null,

      trend:
        unemploymentRate === null ||
        previousUnemploymentRate === null
          ? "UNKNOWN"
          : unemploymentRate >
              previousUnemploymentRate
            ? "RISING"
            : unemploymentRate <
                previousUnemploymentRate
              ? "FALLING"
              : "FLAT"
    },

    payroll: {
      employmentThousands:
        payrollLevel,

      previousEmploymentThousands:
        previousPayrollLevel,

      changeThousands:
        payrollChangeThousands,

      year:
        latestPayroll?.year ||
        null,

      period:
        latestPayroll?.periodName ||
        null,

      trend:
        payrollChangeThousands === null
          ? "UNKNOWN"
          : payrollChangeThousands >
              0
            ? "EXPANDING"
            : payrollChangeThousands <
                0
              ? "CONTRACTING"
              : "FLAT"
    }
  };


  usMacroCache = {
    savedAt:
      Date.now(),

    data:
      snapshot
  };


  return {
    source:
      "BLS PUBLIC API",

    ...snapshot
  };
}


const EURO_AREA_MACRO_CACHE_TTL =
  30 * 60 * 1000;

let euroAreaMacroCache =
  null;


async function fetchEurostatJson(
  url,
  label
) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;


  try {

    response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json"
          },

          signal:
            controller.signal
        }
      );

  } catch (
    error
  ) {

    if (
      error &&
      error.name ===
        "AbortError"
    ) {

      throw new Error(
        label +
        " request timed out"
      );
    }


    throw new Error(
      label +
      " network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(
        text
      );

  } catch {

    throw new Error(
      label +
      " returned invalid JSON"
    );
  }


  if (
    !response.ok
  ) {

    throw new Error(
      data?.error?.message ||
      label +
      " request failed"
    );
  }


  return data;
}


function eurostatTimeRows(
  data
) {

  const timeIndex =
    data?.dimension
      ?.time
      ?.category
      ?.index ||
    {};


  return Object
    .entries(
      timeIndex
    )
    .sort(
      (
        a,
        b
      ) =>
        a[1] -
        b[1]
    )
    .map(
      (
        [
          period,
          position
        ]
      ) => {

        const rawValue =
          Array.isArray(
            data.value
          )
            ? data.value[
                position
              ]
            : data.value?.[
                String(
                  position
                )
              ];


        return {
          period,

          value:
            numericValue(
              rawValue
            )
        };
      }
    )
    .filter(
      row =>
        row.value !==
          null
    );
}


function simpleTrend(
  latest,
  previous,
  risingLabel =
    "RISING",
  fallingLabel =
    "FALLING"
) {

  if (
    latest === null ||
    previous === null
  ) {

    return "UNKNOWN";
  }


  if (
    latest >
      previous
  ) {

    return risingLabel;
  }


  if (
    latest <
      previous
  ) {

    return fallingLabel;
  }


  return "FLAT";
}


async function fetchEuroAreaMacroSnapshot() {

  if (
    euroAreaMacroCache &&
    Date.now() -
      euroAreaMacroCache.savedAt <
      EURO_AREA_MACRO_CACHE_TTL
  ) {

    return {
      source:
        "EUROSTAT CACHE",

      ...euroAreaMacroCache.data
    };
  }


  const inflationUrl =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr" +
    "?format=JSON" +
    "&lang=EN" +
    "&freq=M" +
    "&unit=RCH_A" +
    "&coicop18=TOTAL" +
    "&geo=EA" +
    "&lastTimePeriod=8";


  const unemploymentUrl =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m" +
    "?format=JSON" +
    "&lang=EN" +
    "&freq=M" +
    "&s_adj=SA" +
    "&unit=PC_ACT" +
    "&sex=T" +
    "&age=TOTAL" +
    "&geo=EA21" +
    "&lastTimePeriod=8";


  const gdpUrl =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/namq_10_gdp" +
    "?format=JSON" +
    "&lang=EN" +
    "&freq=Q" +
    "&unit=CLV_PCH_PRE" +
    "&s_adj=SCA" +
    "&na_item=B1GQ" +
    "&geo=EA21" +
    "&lastTimePeriod=8";


  const [
    inflationData,
    unemploymentData,
    gdpData
  ] =
    await Promise.all([
      fetchEurostatJson(
        inflationUrl,
        "Eurostat inflation"
      ),

      fetchEurostatJson(
        unemploymentUrl,
        "Eurostat unemployment"
      ),

      fetchEurostatJson(
        gdpUrl,
        "Eurostat GDP"
      )
    ]);


  const inflationRows =
    eurostatTimeRows(
      inflationData
    );


  const unemploymentRows =
    eurostatTimeRows(
      unemploymentData
    );


  const gdpRows =
    eurostatTimeRows(
      gdpData
    );


  const latestInflation =
    inflationRows.at(-1) ||
    null;


  const previousInflation =
    inflationRows.at(-2) ||
    null;


  const latestUnemployment =
    unemploymentRows.at(-1) ||
    null;


  const previousUnemployment =
    unemploymentRows.at(-2) ||
    null;


  const latestGdp =
    gdpRows.at(-1) ||
    null;


  const previousGdp =
    gdpRows.at(-2) ||
    null;


  const snapshot = {
    country:
      "Euro Area",

    currency:
      "EUR",

    inflation: {
      ratePercent:
        latestInflation
          ?.value ??
        null,

      previousRatePercent:
        previousInflation
          ?.value ??
        null,

      period:
        latestInflation
          ?.period ||
        null,

      trend:
        simpleTrend(
          latestInflation
            ?.value ??
            null,

          previousInflation
            ?.value ??
            null
        ),

      providerUpdated:
        inflationData
          ?.updated ||
        null
    },

    unemployment: {
      ratePercent:
        latestUnemployment
          ?.value ??
        null,

      previousRatePercent:
        previousUnemployment
          ?.value ??
        null,

      period:
        latestUnemployment
          ?.period ||
        null,

      trend:
        simpleTrend(
          latestUnemployment
            ?.value ??
            null,

          previousUnemployment
            ?.value ??
            null
        ),

      providerUpdated:
        unemploymentData
          ?.updated ||
        null
    },

    gdp: {
      qoqPercent:
        latestGdp
          ?.value ??
        null,

      previousQoQPercent:
        previousGdp
          ?.value ??
        null,

      period:
        latestGdp
          ?.period ||
        null,

      trend:
        simpleTrend(
          latestGdp
            ?.value ??
            null,

          previousGdp
            ?.value ??
            null,

          "ACCELERATING",
          "DECELERATING"
        ),

      state:
        latestGdp
          ?.value > 0
          ? "EXPANDING"
          : latestGdp
              ?.value < 0
            ? "CONTRACTING"
            : latestGdp
                ?.value === 0
              ? "FLAT"
              : "UNKNOWN",

      providerUpdated:
        gdpData
          ?.updated ||
        null
    }
  };


  euroAreaMacroCache = {
    savedAt:
      Date.now(),

    data:
      snapshot
  };


  return {
    source:
      "EUROSTAT PUBLIC API",

    ...snapshot
  };
}



const JAPAN_MACRO_CACHE_TTL =
  15 * 60 * 1000;


async function fetchOecdCsvSeries(
  url,
  label
) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );

  let response;
  let text = "";
  let fetchProblem = null;

  try {

    response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "text/csv",

            "User-Agent":
              "Mozilla/5.0"
          },

          signal:
            controller.signal
        }
      );


    if (
      response.ok
    ) {

      text =
        await response.text();

    } else {

      fetchProblem =
        "HTTP " +
        response.status;
    }

  } catch (error) {

    fetchProblem =
      error?.name ===
        "AbortError"
        ? "fetch timed out"
        : (
            error?.message ||
            "fetch failed"
          );

  } finally {

    clearTimeout(
      timeout
    );
  }


  /*
   * Some OECD SDMX endpoints return HTTP 500
   * to Node/undici while the same valid request
   * succeeds through curl.
   *
   * Keep normal fetch as the portable primary
   * path, then automatically fall back to curl.
   */
  if (
    !text.trim()
  ) {

    const {
      execFile
    } =
      require(
        "node:child_process"
      );


    try {

      text =
        await new Promise(
          (
            resolve,
            reject
          ) => {

            execFile(
              "curl",
              [
                "-L",
                "-sS",
                "--fail-with-body",
                "--max-time",
                "25",
                "-H",
                "Accept: text/csv",
                url
              ],
              {
                maxBuffer:
                  10 *
                  1024 *
                  1024
              },
              (
                error,
                stdout,
                stderr
              ) => {

                if (error) {

                  reject(
                    new Error(
                      (
                        stderr ||
                        error.message ||
                        "curl failed"
                      ).trim()
                    )
                  );

                  return;
                }

                resolve(
                  stdout
                );
              }
            );
          }
        );

    } catch (error) {

      throw new Error(
        label +
        " request failed. Node fetch: " +
        (
          fetchProblem ||
          "unknown error"
        ) +
        "; curl fallback: " +
        (
          error?.message ||
          "failed"
        )
      );
    }
  }


  if (
    !text.trim()
  ) {

    throw new Error(
      label +
      " returned no data"
    );
  }


  const lines =
    text
      .trim()
      .split(
        /\r?\n/
      );


  if (
    lines.length < 2
  ) {

    throw new Error(
      label +
      " returned no observations"
    );
  }


  const header =
    parseCsvLine(
      lines[0]
    );


  const timeIndex =
    header.indexOf(
      "TIME_PERIOD"
    );

  const valueIndex =
    header.indexOf(
      "OBS_VALUE"
    );


  if (
    timeIndex === -1 ||
    valueIndex === -1
  ) {

    throw new Error(
      label +
      " CSV format changed"
    );
  }


  return lines
    .slice(1)
    .map(
      line => {

        const fields =
          parseCsvLine(
            line
          );

        return {
          period:
            fields[
              timeIndex
            ] ||
            "",

          value:
            numericValue(
              fields[
                valueIndex
              ]
            )
        };
      }
    )
    .filter(
      row =>
        row.period &&
        row.value !==
          null
    )
    .sort(
      (a, b) =>
        String(
          a.period
        ).localeCompare(
          String(
            b.period
          )
        )
    );
}


async function fetchJapanMacroSnapshot() {

  if (
    japanMacroCache &&
    Date.now() -
      japanMacroCache.savedAt <
      JAPAN_MACRO_CACHE_TTL
  ) {

    return {
      source:
        "OECD CACHE",

      ...japanMacroCache.data
    };
  }


  const year =
    new Date()
      .getUTCFullYear();


  const monthlyStart =
    String(
      year - 1
    ) +
    "-01";


  const quarterlyStart =
    String(
      year - 1
    ) +
    "-Q1";


  const cpiUrl =
    "https://sdmx.oecd.org/public/rest/data/" +
    "OECD.SDD.TPS,DSD_PRICES_COICOP2018@DF_PRICES_C2018_ALL,1.0/" +
    "JPN.M.N.CPI.PA._T.N.GY" +
    "?startPeriod=" +
    encodeURIComponent(
      monthlyStart
    ) +
    "&dimensionAtObservation=AllDimensions" +
    "&format=csvfile";


  const unemploymentUrl =
    "https://sdmx.oecd.org/public/rest/data/" +
    "OECD.SDD.TPS,DSD_LFS@DF_IALFS_INDIC,1.0/" +
    "JPN.UNE_LF_M...Y._T.Y_GE15..M" +
    "?startPeriod=" +
    encodeURIComponent(
      monthlyStart
    ) +
    "&dimensionAtObservation=AllDimensions" +
    "&format=csvfile";


  const gdpUrl =
    "https://sdmx.oecd.org/public/rest/data/" +
    "OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,1.1/" +
    "Q..JPN.S1..B1GQ......G1." +
    "?startPeriod=" +
    encodeURIComponent(
      quarterlyStart
    ) +
    "&dimensionAtObservation=AllDimensions" +
    "&format=csvfile";


  /*
   * OECD can throttle or delay concurrent
   * SDMX requests. Fetch the Japan series
   * sequentially so one slow request does
   * not cause the other series to disappear.
   */
  async function safeJapanSeries(
    url,
    label
  ) {

    try {

      return await fetchOecdCsvSeries(
        url,
        label
      );

    } catch (error) {

      console.warn(
        "[Japan Macro]",
        label,
        error?.message ||
          "request failed"
      );

      return [];
    }
  }


  const cpiRows =
    await safeJapanSeries(
      cpiUrl,
      "OECD Japan CPI"
    );


  const unemploymentRows =
    await safeJapanSeries(
      unemploymentUrl,
      "OECD Japan unemployment"
    );


  const gdpRows =
    await safeJapanSeries(
      gdpUrl,
      "OECD Japan GDP"
    );


  if (
    cpiRows.length === 0 &&
    unemploymentRows.length === 0 &&
    gdpRows.length === 0
  ) {

    throw new Error(
      "Japan macro data unavailable"
    );
  }


  const latestCpi =
    cpiRows.at(-1) ||
    null;

  const previousCpi =
    cpiRows.at(-2) ||
    null;


  const latestUnemployment =
    unemploymentRows.at(-1) ||
    null;

  const previousUnemployment =
    unemploymentRows.at(-2) ||
    null;


  const latestGdp =
    gdpRows.at(-1) ||
    null;

  const previousGdp =
    gdpRows.at(-2) ||
    null;


  const snapshot = {
    country:
      "Japan",

    currency:
      "JPY",

    cpi: {
      yoyPercent:
        latestCpi?.value ??
        null,

      previousYoYPercent:
        previousCpi?.value ??
        null,

      period:
        latestCpi?.period ||
        null,

      trend:
        simpleTrend(
          latestCpi?.value ??
            null,

          previousCpi?.value ??
            null
        )
    },

    unemployment: {
      ratePercent:
        latestUnemployment
          ?.value ??
        null,

      previousRatePercent:
        previousUnemployment
          ?.value ??
        null,

      period:
        latestUnemployment
          ?.period ||
        null,

      trend:
        simpleTrend(
          latestUnemployment
            ?.value ??
            null,

          previousUnemployment
            ?.value ??
            null
        )
    },

    gdp: {
      qoqPercent:
        latestGdp?.value ??
        null,

      previousQoQPercent:
        previousGdp?.value ??
        null,

      period:
        latestGdp?.period ||
        null,

      trend:
        simpleTrend(
          latestGdp?.value ??
            null,

          previousGdp?.value ??
            null,

          "ACCELERATING",
          "DECELERATING"
        )
    }
  };


  japanMacroCache = {
    savedAt:
      Date.now(),

    data:
      snapshot
  };


  return {
    source:
      "OECD PUBLIC API",

    ...snapshot
  };
}


function scoreCurrencyMacro(
  currency,
  snapshot
) {

  if (
    !snapshot ||
    snapshot.error
  ) {

    return {
      currency,

      available:
        false,

      score:
        null,

      evidence:
        []
    };
  }


  let score =
    0;


  const evidence =
    [];


  const inflation =
    snapshot.cpi ||
    snapshot.inflation;


  if (
    inflation?.trend ===
      "RISING"
  ) {

    score +=
      1;

    evidence.push({
      factor:
        "INFLATION",

      effect:
        "HAWKISH IMPULSE",

      score:
        1
    });

  } else if (
    inflation?.trend ===
      "FALLING"
  ) {

    score -=
      1;

    evidence.push({
      factor:
        "INFLATION",

      effect:
        "DOVISH IMPULSE",

      score:
        -1
    });
  }


  if (
    snapshot.unemployment
      ?.trend ===
      "FALLING"
  ) {

    score +=
      1;

    evidence.push({
      factor:
        "LABOUR MARKET",

      effect:
        "IMPROVING",

      score:
        1
    });

  } else if (
    snapshot.unemployment
      ?.trend ===
      "RISING"
  ) {

    score -=
      1;

    evidence.push({
      factor:
        "LABOUR MARKET",

      effect:
        "WEAKENING",

      score:
        -1
    });
  }


  if (
    snapshot.payroll
      ?.trend ===
      "EXPANDING"
  ) {

    score +=
      1;

    evidence.push({
      factor:
        "PAYROLL",

      effect:
        "EXPANDING",

      score:
        1
    });

  } else if (
    snapshot.payroll
      ?.trend ===
      "CONTRACTING"
  ) {

    score -=
      1;

    evidence.push({
      factor:
        "PAYROLL",

      effect:
        "CONTRACTING",

      score:
        -1
    });
  }


  const gdp =
    snapshot.gdp
      ?.qoqPercent;


  if (
    typeof gdp ===
      "number"
  ) {

    if (
      gdp > 0
    ) {

      score +=
        1;

      evidence.push({
        factor:
          "GDP",

        effect:
          "EXPANDING",

        score:
          1
      });

    } else if (
      gdp < 0
    ) {

      score -=
        1;

      evidence.push({
        factor:
          "GDP",

        effect:
          "CONTRACTING",

        score:
          -1
      });
    }
  }


  return {
    currency,

    available:
      true,

    score,

    evidence
  };
}


function buildMacroPairComparison(
  base,
  quote,
  usMacro,
  eurMacro
) {

  const macroMap = {
    USD:
      usMacro,

    EUR:
      eurMacro,

    JPY:
      japanMacroCache
        ?.data ||
      null
  };


  const baseScore =
    scoreCurrencyMacro(
      base,
      macroMap[
        base
      ]
    );


  const quoteScore =
    scoreCurrencyMacro(
      quote,
      macroMap[
        quote
      ]
    );


  if (
    !baseScore.available ||
    !quoteScore.available
  ) {

    return {
      state:
        "INCOMPLETE",

      relativeTilt:
        "NOT ENOUGH FREE MACRO DATA",

      base:
        baseScore,

      quote:
        quoteScore,

      baseSnapshot:
        macroMap[
          base
        ] ||
        null,

      quoteSnapshot:
        macroMap[
          quote
        ] ||
        null,

      note:
        "Macro comparison currently supports currencies with connected public datasets. Policy rates and live event calendar are not yet included."
    };
  }


  const difference =
    baseScore.score -
    quoteScore.score;


  let relativeTilt =
    "BALANCED / MIXED";


  if (
    difference >=
      2
  ) {

    relativeTilt =
      "BASE-FAVORING MACRO TILT";

  } else if (
    difference <=
      -2
  ) {

    relativeTilt =
      "QUOTE-FAVORING MACRO TILT";
  }


  return {
    state:
      "MACRO CONTEXT ONLY",

    relativeTilt,

    difference,

    base:
      baseScore,

    quote:
      quoteScore,

    baseSnapshot:
      macroMap[
        base
      ] ||
      null,

    quoteSnapshot:
      macroMap[
        quote
      ] ||
      null,

    note:
      "This is a transparent macro context score, not a trade signal. Policy rates and live economic-event risk are not yet included."
  };
}


const POLICY_RATE_CACHE_TTL =
  15 * 60 * 1000;

let fedPolicyRateCache =
  null;

let ecbPolicyRateCache =
  null;

let japanMacroCache =
  null;

let bojOvernightRateCache =
  null;


function rateDirection(
  current,
  previous
) {

  if (
    typeof current !==
      "number" ||
    typeof previous !==
      "number"
  ) {

    return "UNKNOWN";
  }


  if (
    current >
      previous
  ) {

    return "HIKE";
  }


  if (
    current <
      previous
  ) {

    return "CUT";
  }


  return "UNCHANGED";
}


function previousDistinctRate(
  rows,
  currentValue
) {

  for (
    let i =
      rows.length - 2;
    i >= 0;
    i--
  ) {

    if (
      typeof rows[i].value ===
        "number" &&
      rows[i].value !==
        currentValue
    ) {

      return rows[i];
    }
  }


  return null;
}


async function fetchFredRateSeries(
  id
) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;


  try {

    response =
      await fetch(
        "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" +
          encodeURIComponent(
            id
          ),
        {
          signal:
            controller.signal
        }
      );

  } catch (
    error
  ) {

    if (
      error?.name ===
        "AbortError"
    ) {

      throw new Error(
        "Fed rate request timed out"
      );
    }


    throw new Error(
      "Fed rate network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  if (
    !response.ok
  ) {

    throw new Error(
      "Fed rate provider request failed"
    );
  }


  const text =
    await response.text();


  return text
    .trim()
    .split(
      /\r?\n/
    )
    .slice(1)
    .map(
      line => {

        const [
          date,
          rawValue
        ] =
          line.split(
            ","
          );


        const value =
          numericValue(
            rawValue
          );


        return {
          date,
          value
        };
      }
    )
    .filter(
      row =>
        row.date &&
        row.value !==
          null
    );
}


async function fetchFedPolicyRate() {

  if (
    fedPolicyRateCache &&
    Date.now() -
      fedPolicyRateCache.savedAt <
      POLICY_RATE_CACHE_TTL
  ) {

    return {
      source:
        "FRED CACHE",

      ...fedPolicyRateCache.data
    };
  }


  const [
    lowerRows,
    upperRows
  ] =
    await Promise.all([
      fetchFredRateSeries(
        "DFEDTARL"
      ),

      fetchFredRateSeries(
        "DFEDTARU"
      )
    ]);


  const latestLower =
    lowerRows.at(-1) ||
    null;

  const latestUpper =
    upperRows.at(-1) ||
    null;


  if (
    !latestLower ||
    !latestUpper
  ) {

    throw new Error(
      "Fed target range data unavailable"
    );
  }


  const currentLower =
    latestLower.value;

  const currentUpper =
    latestUpper.value;


  const previousLower =
    previousDistinctRate(
      lowerRows,
      currentLower
    );


  const previousUpper =
    previousDistinctRate(
      upperRows,
      currentUpper
    );


  const midpoint =
    (
      currentLower +
      currentUpper
    ) / 2;


  const previousMidpoint =
    previousLower &&
    previousUpper
      ? (
          previousLower.value +
          previousUpper.value
        ) / 2
      : null;


  const snapshot = {
    currency:
      "USD",

    centralBank:
      "Federal Reserve",

    rateType:
      "Federal Funds Target Range",

    lowerPercent:
      currentLower,

    upperPercent:
      currentUpper,

    midpointPercent:
      midpoint,

    previousMidpointPercent:
      previousMidpoint,

    date:
      latestUpper.date ||
      latestLower.date,

    previousDate:
      previousUpper?.date ||
      previousLower?.date ||
      null,

    direction:
      rateDirection(
        midpoint,
        previousMidpoint
      )
  };


  fedPolicyRateCache = {
    savedAt:
      Date.now(),

    data:
      snapshot
  };


  return {
    source:
      "FRED PUBLIC CSV",

    ...snapshot
  };
}


function parseCsvLine(
  line
) {

  const values =
    [];

  let value =
    "";

  let quoted =
    false;


  for (
    let i = 0;
    i < line.length;
    i++
  ) {

    const char =
      line[i];


    if (
      char === '"'
    ) {

      if (
        quoted &&
        line[i + 1] ===
          '"'
      ) {

        value +=
          '"';

        i++;

      } else {

        quoted =
          !quoted;
      }

    } else if (
      char === "," &&
      !quoted
    ) {

      values.push(
        value
      );

      value =
        "";

    } else {

      value +=
        char;
    }
  }


  values.push(
    value
  );


  return values;
}


async function fetchEcbPolicyRate() {

  if (
    ecbPolicyRateCache &&
    Date.now() -
      ecbPolicyRateCache.savedAt <
      POLICY_RATE_CACHE_TTL
  ) {

    return {
      source:
        "ECB CACHE",

      ...ecbPolicyRateCache.data
    };
  }


  const url =
    "https://data-api.ecb.europa.eu/service/data/" +
    "FM/D.U2.EUR.4F.KR.DFR.LEV" +
    "?format=csvdata" +
    "&lastNObservations=180";


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;


  try {

    response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "text/csv"
          },

          signal:
            controller.signal
        }
      );

  } catch (
    error
  ) {

    if (
      error?.name ===
        "AbortError"
    ) {

      throw new Error(
        "ECB rate request timed out"
      );
    }


    throw new Error(
      "ECB rate network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  if (
    !response.ok
  ) {

    throw new Error(
      "ECB policy-rate request failed"
    );
  }


  const text =
    await response.text();


  const lines =
    text
      .trim()
      .split(
        /\r?\n/
      );


  if (
    lines.length <
      2
  ) {

    throw new Error(
      "ECB policy-rate data unavailable"
    );
  }


  const header =
    parseCsvLine(
      lines[0]
    );


  const dateIndex =
    header.indexOf(
      "TIME_PERIOD"
    );


  const valueIndex =
    header.indexOf(
      "OBS_VALUE"
    );


  if (
    dateIndex === -1 ||
    valueIndex === -1
  ) {

    throw new Error(
      "ECB policy-rate CSV format changed"
    );
  }


  const rows =
    lines
      .slice(1)
      .map(
        line => {

          const fields =
            parseCsvLine(
              line
            );


          return {
            date:
              fields[
                dateIndex
              ] ||
              "",

            value:
              numericValue(
                fields[
                  valueIndex
                ]
              )
          };
        }
      )
      .filter(
        row =>
          row.date &&
          row.value !==
            null
      );


  const latest =
    rows.at(-1) ||
    null;


  if (!latest) {

    throw new Error(
      "ECB deposit rate unavailable"
    );
  }


  const previous =
    previousDistinctRate(
      rows,
      latest.value
    );


  const snapshot = {
    currency:
      "EUR",

    centralBank:
      "European Central Bank",

    rateType:
      "Deposit Facility Rate",

    ratePercent:
      latest.value,

    previousRatePercent:
      previous?.value ??
      null,

    date:
      latest.date,

    previousDate:
      previous?.date ||
      null,

    direction:
      rateDirection(
        latest.value,
        previous?.value ??
        null
      )
  };


  ecbPolicyRateCache = {
    savedAt:
      Date.now(),

    data:
      snapshot
  };


  return {
    source:
      "ECB DATA API",

    ...snapshot
  };
}



async function fetchBojOvernightRate() {

  if (
    bojOvernightRateCache &&
    Date.now() -
      bojOvernightRateCache.savedAt <
      POLICY_RATE_CACHE_TTL
  ) {

    return {
      source:
        "BOJ CACHE",

      ...bojOvernightRateCache.data
    };
  }


  const start =
    new Date(
      Date.now() -
      180 *
        24 *
        60 *
        60 *
        1000
    );


  const startDate =
    String(
      start.getUTCFullYear()
    ) +
    String(
      start.getUTCMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const url =
    "https://www.stat-search.boj.or.jp/api/v1/getDataCode" +
    "?format=json" +
    "&lang=en" +
    "&db=FM01" +
    "&startDate=" +
    startDate +
    "&code=STRDCLUCON";


  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;


  try {

    response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json"
          },

          signal:
            controller.signal
        }
      );

  } catch (error) {

    if (
      error?.name ===
        "AbortError"
    ) {

      throw new Error(
        "BOJ rate request timed out"
      );
    }

    throw new Error(
      "BOJ rate network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  if (!response.ok) {

    throw new Error(
      "BOJ rate request failed"
    );
  }


  const data =
    await response.json();


  if (
    Number(
      data.STATUS ??
      data.status
    ) !== 200
  ) {

    throw new Error(
      data.MESSAGE ||
      data.message ||
      "BOJ rate API returned an error"
    );
  }


  const resultSet =
    data.RESULTSET ||
    data.resultset ||
    [];


  const series =
    Array.isArray(
      resultSet
    )
      ? resultSet[0]
      : null;


  const valueBlock =
    series?.VALUES ||
    series?.values ||
    {};


  const dates =
    valueBlock.SURVEY_DATES ||
    valueBlock.survey_dates ||
    [];


  const values =
    valueBlock.VALUES ||
    valueBlock.values ||
    [];


  const rows = [];


  const length =
    Math.min(
      dates.length,
      values.length
    );


  for (
    let i = 0;
    i < length;
    i++
  ) {

    const value =
      numericValue(
        values[i]
      );


    if (
      dates[i] &&
      value !== null
    ) {

      rows.push({
        date:
          String(
            dates[i]
          ),

        value
      });
    }
  }


  if (
    rows.length === 0
  ) {

    throw new Error(
      "BOJ overnight-rate data unavailable"
    );
  }


  const latest =
    rows.at(-1);

  const previous =
    rows.at(-2) ||
    null;


  const snapshot = {
    currency:
      "JPY",

    centralBank:
      "Bank of Japan",

    rateType:
      "Uncollateralized Overnight Call Rate (Average)",

    ratePercent:
      latest.value,

    previousRatePercent:
      previous?.value ??
      null,

    date:
      latest.date,

    previousDate:
      previous?.date ||
      null,

    direction:
      "OBSERVED MARKET RATE"
  };


  bojOvernightRateCache = {
    savedAt:
      Date.now(),

    data:
      snapshot
  };


  return {
    source:
      "BOJ TIME-SERIES API",

    ...snapshot
  };
}


function buildPolicyRateComparison(
  base,
  quote,
  fedRate,
  ecbRate
) {

  const rateMap = {
    USD:
      fedRate,

    EUR:
      ecbRate,

    JPY:
      bojOvernightRateCache
        ?.data ||
      null
  };


  const baseRate =
    rateMap[
      base
    ] ||
    null;


  const quoteRate =
    rateMap[
      quote
    ] ||
    null;


  function effectiveRate(
    item
  ) {

    if (!item) {
      return null;
    }


    if (
      typeof item
        .midpointPercent ===
        "number"
    ) {

      return item
        .midpointPercent;
    }


    if (
      typeof item
        .ratePercent ===
        "number"
    ) {

      return item
        .ratePercent;
    }


    return null;
  }


  const baseValue =
    effectiveRate(
      baseRate
    );


  const quoteValue =
    effectiveRate(
      quoteRate
    );


  if (
    baseValue === null ||
    quoteValue === null
  ) {

    return {
      state:
        "INCOMPLETE",

      baseCurrency:
        base,

      quoteCurrency:
        quote,

      baseRateDetail:
        baseRate,

      quoteRateDetail:
        quoteRate,

      note:
        "Policy-rate comparison is available when both currencies have connected central-bank rate sources."
    };
  }


  const differential =
    baseValue -
    quoteValue;


  let rateAdvantage =
    "BALANCED";


  if (
    differential >
      0.05
  ) {

    rateAdvantage =
      "BASE RATE ADVANTAGE";

  } else if (
    differential <
      -0.05
  ) {

    rateAdvantage =
      "QUOTE RATE ADVANTAGE";
  }


  return {
    state:
      "AVAILABLE",

    baseCurrency:
      base,

    quoteCurrency:
      quote,

    baseRateDetail:
      baseRate,

    quoteRateDetail:
      quoteRate,

    baseRatePercent:
      baseValue,

    quoteRatePercent:
      quoteValue,

    differentialPercentagePoints:
      differential,

    rateAdvantage,

    baseDirection:
      baseRate.direction,

    quoteDirection:
      quoteRate.direction,

    note:
      "Rate differential is macro context only and is not a standalone trade signal."
  };
}



async function refreshJapanFundamentals() {

  await Promise.allSettled([
    fetchJapanMacroSnapshot(),
    fetchBojOvernightRate()
  ]);
}


refreshJapanFundamentals();


const japanFundamentalRefreshTimer =
  setInterval(
    refreshJapanFundamentals,
    15 * 60 * 1000
  );


japanFundamentalRefreshTimer
  .unref?.();


const FOREX_CURRENCY_COUNTRY = {
  USD: "United States",
  EUR: "Euro Area",
  GBP: "United Kingdom",
  JPY: "Japan",
  CHF: "Switzerland",
  AUD: "Australia",
  CAD: "Canada",
  NZD: "New Zealand",

  CNY: "China",
  CNH: "China",
  HKD: "Hong Kong",
  SGD: "Singapore",
  KRW: "South Korea",
  INR: "India",
  IDR: "Indonesia",
  MYR: "Malaysia",
  THB: "Thailand",
  PHP: "Philippines",
  TWD: "Taiwan",

  NOK: "Norway",
  SEK: "Sweden",
  DKK: "Denmark",
  PLN: "Poland",
  CZK: "Czech Republic",
  HUF: "Hungary",
  RON: "Romania",
  BGN: "Bulgaria",
  ISK: "Iceland",

  TRY: "Turkey",
  RUB: "Russia",
  UAH: "Ukraine",

  BRL: "Brazil",
  MXN: "Mexico",
  ARS: "Argentina",
  CLP: "Chile",
  COP: "Colombia",
  PEN: "Peru",

  ZAR: "South Africa",
  EGP: "Egypt",
  NGN: "Nigeria",
  KES: "Kenya",

  AED: "United Arab Emirates",
  SAR: "Saudi Arabia",
  QAR: "Qatar",
  KWD: "Kuwait",
  BHD: "Bahrain",
  OMR: "Oman",
  ILS: "Israel",

  PKR: "Pakistan",
  BDT: "Bangladesh",
  LKR: "Sri Lanka",

  VND: "Vietnam"
};


function isoDateOnly(
  date
) {

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}


function normalizeFundamentalEvent(
  row
) {

  const importance =
    Math.max(
      0,
      Number(
        row.Importance ??
        row.importance ??
        0
      ) || 0
    );


  return {
    id:
      String(
        row.CalendarId ??
        row.calendarId ??
        ""
      ),

    date:
      String(
        row.Date ??
        row.date ??
        ""
      ),

    country:
      String(
        row.Country ??
        row.country ??
        ""
      ),

    category:
      String(
        row.Category ??
        row.category ??
        ""
      ),

    event:
      String(
        row.Event ??
        row.event ??
        ""
      ),

    importance,

    impact:
      importance >= 3
        ? "HIGH"
        : importance === 2
          ? "MEDIUM"
          : "LOW",

    actual:
      String(
        row.Actual ??
        row.actual ??
        ""
      ),

    previous:
      String(
        row.Previous ??
        row.previous ??
        ""
      ),

    forecast:
      String(
        row.Forecast ??
        row.forecast ??
        ""
      ),

    teForecast:
      String(
        row.TEForecast ??
        row.teForecast ??
        ""
      ),

    unit:
      String(
        row.Unit ??
        row.unit ??
        ""
      ),

    source:
      String(
        row.Source ??
        row.source ??
        ""
      )
  };
}


async function fetchForexFundamentalCalendar(
  countries,
  fromDate,
  toDate
) {

  const apiKey =
    String(
      process.env
        .TRADING_ECONOMICS_API_KEY ||
      ""
    ).trim();


  if (!apiKey) {

    return {
      configured:
        false,

      source:
        "NOT CONFIGURED",

      events:
        []
    };
  }


  const cleanCountries =
    Array.from(
      new Set(
        countries
          .map(
            value =>
              String(
                value ||
                ""
              ).trim()
          )
          .filter(
            Boolean
          )
      )
    );


  if (
    cleanCountries.length ===
      0
  ) {

    return {
      configured:
        true,

      source:
        "NO COUNTRY MAPPING",

      events:
        []
    };
  }


  const cacheKey =
    [
      ...cleanCountries
        .sort(),
      fromDate,
      toDate
    ].join(
      "|"
    );


  const cached =
    fundamentalCache.get(
      cacheKey
    );


  if (
    cached &&
    Date.now() -
      cached.savedAt <
      FUNDAMENTAL_CACHE_TTL
  ) {

    return {
      configured:
        true,

      source:
        "CACHE",

      events:
        cached.events
    };
  }


  const countryPath =
    cleanCountries
      .map(
        country =>
          encodeURIComponent(
            country
          )
      )
      .join(
        ","
      );


  const url =
    "https://api.tradingeconomics.com/calendar/country/" +
    countryPath +
    "/" +
    fromDate +
    "/" +
    toDate +
    "?f=json";


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;


  try {

    response =
      await fetch(
        url,
        {
          headers: {
            Authorization:
              apiKey,

            Accept:
              "application/json"
          },

          signal:
            controller.signal
        }
      );

  } catch (
    error
  ) {

    if (
      error &&
      error.name ===
        "AbortError"
    ) {

      throw new Error(
        "Fundamental data request timed out"
      );
    }


    throw new Error(
      "Fundamental data network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(
        text
      );

  } catch {

    throw new Error(
      "Fundamental provider returned invalid JSON"
    );
  }


  if (
    !response.ok
  ) {

    throw new Error(
      data?.message ||
      data?.error ||
      "Fundamental provider request failed"
    );
  }


  if (
    !Array.isArray(
      data
    )
  ) {

    throw new Error(
      "Fundamental provider returned unexpected data"
    );
  }


  const events =
    data
      .map(
        normalizeFundamentalEvent
      )
      .filter(
        event =>
          event.date &&
          event.event
      )
      .sort(
        (
          a,
          b
        ) =>
          Date.parse(
            a.date
          ) -
          Date.parse(
            b.date
          )
      );


  fundamentalCache.set(
    cacheKey,
    {
      savedAt:
        Date.now(),

      events
    }
  );


  if (
    fundamentalCache.size >
      100
  ) {

    const oldestKey =
      fundamentalCache
        .keys()
        .next()
        .value;


    if (oldestKey) {

      fundamentalCache.delete(
        oldestKey
      );
    }
  }


  return {
    configured:
      true,

    source:
      "TRADING ECONOMICS",

    events
  };
}


const BLS_CALENDAR_CACHE_TTL =
  6 * 60 * 60 * 1000;

let blsCalendarCache =
  null;


function unfoldIcsText(
  text
) {

  return String(
    text ||
    ""
  ).replace(
    /\r?\n[ \t]/g,
    ""
  );
}


function decodeIcsText(
  value
) {

  return String(
    value ||
    ""
  )
    .replace(
      /\\n/gi,
      " "
    )
    .replace(
      /\\,/g,
      ","
    )
    .replace(
      /\\;/g,
      ";"
    )
    .replace(
      /\\\\/g,
      "\\"
    )
    .trim();
}


function timezoneAlias(
  value
) {

  const zone =
    String(
      value ||
      ""
    ).trim();


  if (
    zone === "US-Eastern"
  ) {

    return "America/New_York";
  }


  return zone ||
    "America/New_York";
}


function zonedLocalToUtc(
  year,
  month,
  day,
  hour,
  minute,
  second,
  timeZone
) {

  let guess =
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    );


  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hourCycle:
          "h23"
      }
    );


  for (
    let pass = 0;
    pass < 2;
    pass++
  ) {

    const parts =
      Object.fromEntries(
        formatter
          .formatToParts(
            new Date(
              guess
            )
          )
          .filter(
            part =>
              part.type !==
              "literal"
          )
          .map(
            part => [
              part.type,
              part.value
            ]
          )
      );


    const representedUtc =
      Date.UTC(
        Number(
          parts.year
        ),
        Number(
          parts.month
        ) - 1,
        Number(
          parts.day
        ),
        Number(
          parts.hour
        ),
        Number(
          parts.minute
        ),
        Number(
          parts.second
        )
      );


    const desiredUtc =
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second
      );


    guess +=
      desiredUtc -
      representedUtc;
  }


  return new Date(
    guess
  );
}


function parseIcsDate(
  rawValue,
  rawTimezone
) {

  const value =
    String(
      rawValue ||
      ""
    ).trim();


  if (
    /^\d{8}$/.test(
      value
    )
  ) {

    const year =
      Number(
        value.slice(
          0,
          4
        )
      );

    const month =
      Number(
        value.slice(
          4,
          6
        )
      );

    const day =
      Number(
        value.slice(
          6,
          8
        )
      );


    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12,
        0,
        0
      )
    );
  }


  const match =
    value.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/
    );


  if (!match) {
    return null;
  }


  const year =
    Number(
      match[1]
    );

  const month =
    Number(
      match[2]
    );

  const day =
    Number(
      match[3]
    );

  const hour =
    Number(
      match[4]
    );

  const minute =
    Number(
      match[5]
    );

  const second =
    Number(
      match[6] ||
      0
    );


  if (
    match[7] === "Z"
  ) {

    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second
      )
    );
  }


  return zonedLocalToUtc(
    year,
    month,
    day,
    hour,
    minute,
    second,
    timezoneAlias(
      rawTimezone
    )
  );
}


function blsEventImpact(
  name
) {

  const text =
    String(
      name ||
      ""
    ).toLowerCase();


  if (
    /consumer price index/.test(
      text
    ) ||
    /employment situation/.test(
      text
    )
  ) {

    return {
      importance:
        3,

      impact:
        "HIGH"
    };
  }


  if (
    /producer price index/.test(
      text
    ) ||
    /job openings and labor turnover/.test(
      text
    ) ||
    /employment cost index/.test(
      text
    ) ||
    /productivity and costs/.test(
      text
    ) ||
    /import and export price/.test(
      text
    ) ||
    /real earnings/.test(
      text
    )
  ) {

    return {
      importance:
        2,

      impact:
        "MEDIUM"
    };
  }


  return {
    importance:
      1,

    impact:
      "LOW"
  };
}


function parseBlsCalendar(
  text
) {

  const lines =
    unfoldIcsText(
      text
    )
      .split(
        /\r?\n/
      );


  const events =
    [];

  let current =
    null;


  for (
    const line of
      lines
  ) {

    if (
      line ===
        "BEGIN:VEVENT"
    ) {

      current = {
        summary:
          "",

        date:
          null,

        timezone:
          "America/New_York"
      };

      continue;
    }


    if (
      line ===
        "END:VEVENT"
    ) {

      if (
        current &&
        current.summary &&
        current.date
      ) {

        const classification =
          blsEventImpact(
            current.summary
          );


        events.push({
          id:
            "BLS-" +
            current.date.getTime() +
            "-" +
            current.summary,

          date:
            current.date
              .toISOString(),

          country:
            "United States",

          currency:
            "USD",

          category:
            "BLS Economic Release",

          event:
            current.summary,

          importance:
            classification
              .importance,

          impact:
            classification
              .impact,

          actual:
            "",

          previous:
            "",

          forecast:
            "",

          teForecast:
            "",

          unit:
            "",

          source:
            "U.S. Bureau of Labor Statistics",

          provider:
            "BLS RELEASE CALENDAR"
        });
      }


      current =
        null;

      continue;
    }


    if (!current) {
      continue;
    }


    if (
      line.startsWith(
        "SUMMARY:"
      )
    ) {

      current.summary =
        decodeIcsText(
          line.slice(
            "SUMMARY:".length
          )
        );

      continue;
    }


    if (
      line.startsWith(
        "DTSTART"
      )
    ) {

      const colon =
        line.indexOf(
          ":"
        );


      if (
        colon === -1
      ) {
        continue;
      }


      const property =
        line.slice(
          0,
          colon
        );


      const rawValue =
        line.slice(
          colon + 1
        );


      const timezoneMatch =
        property.match(
          /TZID=([^;:]+)/i
        );


      const timezone =
        timezoneAlias(
          timezoneMatch
            ? timezoneMatch[1]
            : "America/New_York"
        );


      current.timezone =
        timezone;


      current.date =
        parseIcsDate(
          rawValue,
          timezone
        );
    }
  }


  return events.sort(
    (
      a,
      b
    ) =>
      Date.parse(
        a.date
      ) -
      Date.parse(
        b.date
      )
  );
}


async function fetchBlsReleaseCalendar() {

  if (
    blsCalendarCache &&
    Date.now() -
      blsCalendarCache.savedAt <
      BLS_CALENDAR_CACHE_TTL
  ) {

    return {
      available:
        true,

      source:
        "BLS CALENDAR CACHE",

      events:
        blsCalendarCache.events
    };
  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;


  try {

    response =
      await fetch(
        "https://www.bls.gov/schedule/news_release/bls.ics",
        {
          headers: {
            Accept:
              "text/calendar"
          },

          signal:
            controller.signal
        }
      );

  } catch (
    error
  ) {

    if (
      error?.name ===
        "AbortError"
    ) {

      throw new Error(
        "BLS event calendar request timed out"
      );
    }


    throw new Error(
      "BLS event calendar network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  if (
    !response.ok
  ) {

    throw new Error(
      "BLS event calendar request failed"
    );
  }


  const text =
    await response.text();


  const events =
    parseBlsCalendar(
      text
    );


  if (
    events.length ===
      0
  ) {

    throw new Error(
      "BLS event calendar returned no events"
    );
  }


  blsCalendarCache = {
    savedAt:
      Date.now(),

    events
  };


  return {
    available:
      true,

    source:
      "BLS RELEASE CALENDAR",

    events
  };
}


function mergeEconomicEvents(
  primary,
  secondary
) {

  const merged =
    new Map();


  for (
    const event of [
      ...(
        Array.isArray(
          primary
        )
          ? primary
          : []
      ),

      ...(
        Array.isArray(
          secondary
        )
          ? secondary
          : []
      )
    ]
  ) {

    const eventName =
      String(
        event.event ||
        ""
      )
        .trim()
        .toUpperCase();


    const eventTime =
      Date.parse(
        event.date
      );


    if (
      !eventName ||
      !Number.isFinite(
        eventTime
      )
    ) {
      continue;
    }


    const roundedMinute =
      Math.floor(
        eventTime /
        60000
      );


    const key =
      [
        event.country ||
          "",
        eventName,
        roundedMinute
      ].join(
        "|"
      );


    if (
      !merged.has(
        key
      )
    ) {

      merged.set(
        key,
        event
      );
    }
  }


  return Array
    .from(
      merged.values()
    )
    .sort(
      (
        a,
        b
      ) =>
        Date.parse(
          a.date
        ) -
        Date.parse(
          b.date
        )
    );
}



/* =========================================
   CRYPTO FUNDAMENTAL ENGINE
   ========================================= */

const CRYPTO_FUNDAMENTAL_CACHE_TTL =
  5 * 60 * 1000;


const cryptoFundamentalCache =
  new Map();


async function fetchCoinGeckoAssetSnapshot(
  symbol
) {

  const base =
    String(
      symbol ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !/^[a-z0-9]{2,15}$/.test(
      base
    )
  ) {
    throw new Error(
      "Invalid crypto symbol"
    );
  }


  const key =
    "asset:" +
    base;


  const cached =
    cryptoFundamentalCache.get(
      key
    );


  if (
    cached &&
    Date.now() -
      cached.time <
      CRYPTO_FUNDAMENTAL_CACHE_TTL
  ) {

    return {
      ...cached.value,
      sourceState:
        "CACHE"
    };
  }


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  try {

    const params =
      new URLSearchParams({
        vs_currency:
          "usd",

        symbols:
          base,

        include_tokens:
          "top",

        price_change_percentage:
          "7d,30d"
      });


    const response =
      await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?" +
          params.toString(),
        {
          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "AITradingAnalyst/1.0"
          }
        }
      );


    if (!response.ok) {
      throw new Error(
        "CoinGecko asset HTTP " +
        response.status
      );
    }


    const json =
      await response.json();


    const coin =
      Array.isArray(
        json
      )
        ? json[0]
        : null;


    if (!coin) {
      throw new Error(
        "Crypto asset not found on CoinGecko"
      );
    }


    const value = {
      source:
        "COINGECKO PUBLIC API",

      sourceState:
        "LIVE",

      id:
        coin.id,

      symbol:
        String(
          coin.symbol ||
          base
        ).toUpperCase(),

      name:
        coin.name ||
        base.toUpperCase(),

      priceUsd:
        coin.current_price,

      marketCapUsd:
        coin.market_cap,

      marketCapRank:
        coin.market_cap_rank,

      volume24hUsd:
        coin.total_volume,

      change24h:
        coin.price_change_percentage_24h,

      change7d:
        coin.price_change_percentage_7d_in_currency,

      change30d:
        coin.price_change_percentage_30d_in_currency,

      athUsd:
        coin.ath,

      athChangePercent:
        coin.ath_change_percentage,

      circulatingSupply:
        coin.circulating_supply,

      totalSupply:
        coin.total_supply,

      maxSupply:
        coin.max_supply
    };


    cryptoFundamentalCache.set(
      key,
      {
        time:
          Date.now(),

        value
      }
    );


    return value;

  } finally {

    clearTimeout(
      timer
    );
  }
}


async function fetchCoinGeckoGlobalSnapshot() {

  const key =
    "global";


  const cached =
    cryptoFundamentalCache.get(
      key
    );


  if (
    cached &&
    Date.now() -
      cached.time <
      CRYPTO_FUNDAMENTAL_CACHE_TTL
  ) {

    return {
      ...cached.value,
      sourceState:
        "CACHE"
    };
  }


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  try {

    const response =
      await fetch(
        "https://api.coingecko.com/api/v3/global",
        {
          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "AITradingAnalyst/1.0"
          }
        }
      );


    if (!response.ok) {
      throw new Error(
        "CoinGecko global HTTP " +
        response.status
      );
    }


    const json =
      await response.json();


    const data =
      json?.data;


    if (!data) {
      throw new Error(
        "Global crypto market data unavailable"
      );
    }


    const value = {
      source:
        "COINGECKO PUBLIC API",

      sourceState:
        "LIVE",

      totalMarketCapUsd:
        data.total_market_cap?.usd,

      totalVolume24hUsd:
        data.total_volume?.usd,

      marketCapChange24h:
        data.market_cap_change_percentage_24h_usd,

      btcDominance:
        data.market_cap_percentage?.btc,

      ethDominance:
        data.market_cap_percentage?.eth,

      activeCryptocurrencies:
        data.active_cryptocurrencies
    };


    cryptoFundamentalCache.set(
      key,
      {
        time:
          Date.now(),

        value
      }
    );


    return value;

  } finally {

    clearTimeout(
      timer
    );
  }
}


function buildCryptoFundamentalContext(
  asset,
  global
) {

  let score = 0;

  const evidence = [];


  const change24h =
    Number(
      asset.change24h
    );


  const change7d =
    Number(
      asset.change7d
    );


  const change30d =
    Number(
      asset.change30d
    );


  const market24h =
    Number(
      global.marketCapChange24h
    );


  if (
    Number.isFinite(
      change24h
    )
  ) {

    if (
      change24h >= 2
    ) {
      score += 1;
      evidence.push(
        "24H asset momentum positive"
      );

    } else if (
      change24h <= -2
    ) {
      score -= 1;
      evidence.push(
        "24H asset momentum negative"
      );
    }
  }


  if (
    Number.isFinite(
      change7d
    )
  ) {

    if (
      change7d >= 5
    ) {
      score += 1;
      evidence.push(
        "7D performance strong"
      );

    } else if (
      change7d <= -5
    ) {
      score -= 1;
      evidence.push(
        "7D performance weak"
      );
    }
  }


  if (
    Number.isFinite(
      change30d
    )
  ) {

    if (
      change30d >= 10
    ) {
      score += 1;
      evidence.push(
        "30D trend positive"
      );

    } else if (
      change30d <= -10
    ) {
      score -= 1;
      evidence.push(
        "30D trend negative"
      );
    }
  }


  if (
    Number.isFinite(
      market24h
    )
  ) {

    if (
      market24h >= 2
    ) {
      score += 1;
      evidence.push(
        "Global crypto market expanding"
      );

    } else if (
      market24h <= -2
    ) {
      score -= 1;
      evidence.push(
        "Global crypto market contracting"
      );
    }
  }


  const rank =
    Number(
      asset.marketCapRank
    );


  if (
    Number.isFinite(
      rank
    ) &&
    rank <= 10
  ) {

    evidence.push(
      "Top-10 market-cap asset"
    );
  }


  let state =
    "BALANCED / MIXED";


  if (
    score >= 2
  ) {
    state =
      "POSITIVE FUNDAMENTAL TILT";
  }


  if (
    score <= -2
  ) {
    state =
      "NEGATIVE FUNDAMENTAL TILT";
  }


  return {
    state,

    score,

    evidence,

    note:
      "Crypto fundamental context uses market, liquidity, supply and broad-market data. It is not a standalone trade signal."
  };
}


app.get(
  "/api/crypto-fundamentals",
  async (
    req,
    res
  ) => {

    try {

      const symbol =
        String(
          req.query.symbol ||
          ""
        )
          .trim()
          .toUpperCase();


      if (
        !/^[A-Z0-9]{2,15}\/[A-Z0-9]{2,15}$/.test(
          symbol
        )
      ) {

        return res
          .status(400)
          .json({
            ok: false,

            error:
              "Crypto fundamentals expects a pair like BTC/USD"
          });
      }


      const [
        base,
        quote
      ] =
        symbol.split(
          "/"
        );


      const [
        asset,
        global
      ] =
        await Promise.all([
          fetchCoinGeckoAssetSnapshot(
            base
          ),

          fetchCoinGeckoGlobalSnapshot()
        ]);


      const context =
        buildCryptoFundamentalContext(
          asset,
          global
        );


      const supplyRatio =
        (
          Number.isFinite(
            Number(
              asset.circulatingSupply
            )
          ) &&
          Number.isFinite(
            Number(
              asset.totalSupply
            )
          ) &&
          Number(
            asset.totalSupply
          ) > 0
        )
          ? (
              Number(
                asset.circulatingSupply
              ) /
              Number(
                asset.totalSupply
              )
            ) *
            100
          : null;


      const volumeToMarketCap =
        (
          Number.isFinite(
            Number(
              asset.volume24hUsd
            )
          ) &&
          Number.isFinite(
            Number(
              asset.marketCapUsd
            )
          ) &&
          Number(
            asset.marketCapUsd
          ) > 0
        )
          ? (
              Number(
                asset.volume24hUsd
              ) /
              Number(
                asset.marketCapUsd
              )
            ) *
            100
          : null;


      res.json({
        ok: true,

        configured:
          true,

        symbol,

        marketType:
          "crypto",

        base,

        quote,

        asset,

        global,

        derived: {
          circulatingPercent:
            supplyRatio,

          volumeToMarketCapPercent:
            volumeToMarketCap
        },

        context,

        providers: {
          asset:
            asset.source,

          global:
            global.source
        },

        note:
          "Crypto fundamentals are a separate context layer and do not automatically override technical analysis."
      });

    } catch (
      error
    ) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Crypto fundamental analysis error"
        });
    }
  }
);


app.get(
  "/api/fundamentals",
  async (
    req,
    res
  ) => {

    try {

      const symbol =
        String(
          req.query.symbol ||
          ""
        )
          .trim()
          .toUpperCase();


      if (
        !/^[A-Z]{3}\/[A-Z]{3}$/.test(
          symbol
        )
      ) {

        return res
          .status(400)
          .json({
            ok: false,

            error:
              "Fundamental analysis currently supports Forex symbols like EUR/USD"
          });
      }


      const [
        base,
        quote
      ] =
        symbol.split(
          "/"
        );


      const baseCountry =
        FOREX_CURRENCY_COUNTRY[
          base
        ] ||
        "";


      const quoteCountry =
        FOREX_CURRENCY_COUNTRY[
          quote
        ] ||
        "";


      const countries =
        Array.from(
          new Set(
            [
              baseCountry,
              quoteCountry
            ].filter(
              Boolean
            )
          )
        );


      const days =
        Math.max(
          1,
          Math.min(
            14,
            Number(
              req.query.days
            ) || 7
          )
        );


      const now =
        new Date();


      const start =
        new Date(
          now.getTime() -
          24 * 60 * 60 * 1000
        );


      const end =
        new Date(
          now.getTime() +
          days *
            24 *
            60 *
            60 *
            1000
        );


      const result =
        await fetchForexFundamentalCalendar(
          countries,
          isoDateOnly(
            start
          ),
          isoDateOnly(
            end
          )
        );


      let usMacro =
        null;


      if (
        base === "USD" ||
        quote === "USD"
      ) {

        try {

          usMacro =
            await fetchUSMacroSnapshot();

        } catch (
          error
        ) {

          usMacro = {
            source:
              "BLS ERROR",

            error:
              error.message ||
              "US macro data unavailable"
          };
        }
      }


      let eurMacro =
        null;


      if (
        base === "EUR" ||
        quote === "EUR"
      ) {

        try {

          eurMacro =
            await fetchEuroAreaMacroSnapshot();

        } catch (
          error
        ) {

          eurMacro = {
            source:
              "EUROSTAT ERROR",

            error:
              error.message ||
              "Euro Area macro data unavailable"
          };
        }
      }


      let fedPolicyRate =
        null;

      let ecbPolicyRate =
        null;


      if (
        base === "USD" ||
        quote === "USD"
      ) {

        try {

          fedPolicyRate =
            await fetchFedPolicyRate();

        } catch (
          error
        ) {

          fedPolicyRate = {
            source:
              "FRED ERROR",

            error:
              error.message ||
              "Fed policy rate unavailable"
          };
        }
      }


      if (
        base === "EUR" ||
        quote === "EUR"
      ) {

        try {

          ecbPolicyRate =
            await fetchEcbPolicyRate();

        } catch (
          error
        ) {

          ecbPolicyRate = {
            source:
              "ECB ERROR",

            error:
              error.message ||
              "ECB policy rate unavailable"
          };
        }
      }


      const macroComparison =
        buildMacroPairComparison(
          base,
          quote,
          usMacro,
          eurMacro
        );


      const policyRateComparison =
        buildPolicyRateComparison(
          base,
          quote,
          fedPolicyRate,
          ecbPolicyRate
        );


      let blsCalendar = {
        available:
          false,

        source:
          "NOT APPLICABLE",

        events:
          []
      };


      if (
        base === "USD" ||
        quote === "USD"
      ) {

        try {

          blsCalendar =
            await fetchBlsReleaseCalendar();

        } catch (
          error
        ) {

          blsCalendar = {
            available:
              false,

            source:
              "BLS CALENDAR ERROR",

            error:
              error.message ||
              "BLS event calendar unavailable",

            events:
              []
          };
        }
      }


      const combinedEvents =
        mergeEconomicEvents(
          result.events,
          blsCalendar.events
        );


      const rangeStartMs =
        start.getTime();

      const rangeEndMs =
        end.getTime();


      const windowEvents =
        combinedEvents.filter(
          event => {

            const time =
              Date.parse(
                event.date
              );


            return (
              Number.isFinite(
                time
              ) &&
              time >=
                rangeStartMs &&
              time <=
                rangeEndMs
            );
          }
        );


      const nowMs =
        Date.now();


      const upcoming =
        windowEvents.filter(
          event =>
            Date.parse(
              event.date
            ) >=
            nowMs
        );


      const recent =
        windowEvents.filter(
          event =>
            Date.parse(
              event.date
            ) <
            nowMs
        );


      const highImpactUpcoming =
        upcoming.filter(
          event =>
            event.impact ===
            "HIGH"
        );


      res.json({
        ok: true,

        configured:
          Boolean(
            result.configured ||
            usMacro ||
            eurMacro
          ),

        calendarConfigured:
          Boolean(
            result.configured ||
            blsCalendar.available
          ),

        symbol,

        base: {
          currency:
            base,

          country:
            baseCountry ||
            null
        },

        quote: {
          currency:
            quote,

          country:
            quoteCountry ||
            null
        },

        source:
          result.configured
            ? result.source
            : (
                usMacro ||
                eurMacro
                  ? "FREE PUBLIC MACRO"
                  : result.source
              ),

        providers: {
          calendar:
            result.configured
              ? (
                  blsCalendar.available
                    ? result.source +
                      " • " +
                      blsCalendar.source
                    : result.source
                )
              : blsCalendar.source,

          blsCalendar:
            blsCalendar.source,

          usMacro:
            usMacro?.source ||
            "NOT APPLICABLE",

          euroAreaMacro:
            eurMacro?.source ||
            "NOT APPLICABLE",

          fedPolicyRate:
            fedPolicyRate?.source ||
            "NOT APPLICABLE",

          ecbPolicyRate:
            ecbPolicyRate?.source ||
            "NOT APPLICABLE"
        },

        macro: {
          usd:
            usMacro,

          eur:
            eurMacro
        },

        macroComparison,

        policyRates: {
          usd:
            fedPolicyRate,

          eur:
            ecbPolicyRate
        },

        policyRateComparison,

        range: {
          from:
            isoDateOnly(
              start
            ),

          to:
            isoDateOnly(
              end
            )
        },

        summary: {
          totalEvents:
            windowEvents.length,

          upcomingEvents:
            upcoming.length,

          recentEvents:
            recent.length,

          highImpactUpcoming:
            highImpactUpcoming.length,

          eventRisk:
            highImpactUpcoming.length >
              0
              ? "HIGH"
              : upcoming.some(
                  event =>
                    event.impact ===
                    "MEDIUM"
                )
                ? "MEDIUM"
                : upcoming.length >
                    0
                  ? "LOW"
                  : "NONE"
        },

        upcoming:
          upcoming.slice(
            0,
            40
          ),

        recent:
          recent
            .slice(
              -20
            )
            .reverse()
      });

    } catch (
      error
    ) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Fundamental analysis error"
        });
    }
  }
);



/* =========================================
   INDIAN STOCK FUNDAMENTALS — UPSTOX
   ========================================= */

app.get(
  "/api/stock-fundamentals",
  async (
    req,
    res
  ) => {

    try {

      const symbol =
        String(
          req.query.symbol ||
          ""
        )
          .trim()
          .toUpperCase();

      const exchange =
        String(
          req.query.exchange ||
          "NSE"
        )
          .trim()
          .toUpperCase();


      if (
        !/^[A-Z0-9&.-]{1,30}$/.test(
          symbol
        )
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Stock fundamentals expects a valid Indian stock symbol"
          });
      }


      if (
        exchange !== "NSE" &&
        exchange !== "BSE"
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Stock fundamentals supports NSE or BSE"
          });
      }


      const token =
        String(
          process.env.UPSTOX_ACCESS_TOKEN ||
          ""
        ).trim();


      if (!token) {

        return res
          .status(503)
          .json({
            ok: false,
            error:
              "Upstox access token is not configured"
          });
      }


      const instrument =
        await resolveUpstoxInstrument(
          symbol,
          exchange
        );


      if (!instrument.isin) {

        return res
          .status(404)
          .json({
            ok: false,
            error:
              `${symbol} ${exchange} ISIN not available`
          });
      }


      const baseUrl =
        "https://api.upstox.com/v2/fundamentals/" +
        encodeURIComponent(
          instrument.isin
        );


      const headers = {
        Accept:
          "application/json",

        Authorization:
          "Bearer " + token
      };


      const [
        profileResponse,
        ratiosResponse
      ] =
        await Promise.all([
          fetch(
            baseUrl +
            "/profile",
            { headers }
          ),

          fetch(
            baseUrl +
            "/key-ratios",
            { headers }
          )
        ]);


      const [
        profileJson,
        ratiosJson
      ] =
        await Promise.all([
          profileResponse.json(),
          ratiosResponse.json()
        ]);


      if (
        !profileResponse.ok
      ) {

        throw new Error(
          profileJson?.errors?.[0]?.message ||
          profileJson?.message ||
          "Upstox company profile unavailable"
        );
      }


      if (
        !ratiosResponse.ok
      ) {

        throw new Error(
          ratiosJson?.errors?.[0]?.message ||
          ratiosJson?.message ||
          "Upstox key ratios unavailable"
        );
      }


      const profile =
        profileJson?.data ||
        {};


      const rawRatios =
        Array.isArray(
          ratiosJson?.data
        )
          ? ratiosJson.data
          : [];


      const ratios =
        rawRatios.map(
          item => ({
            name:
              String(
                item?.name ||
                ""
              ),

            companyValue:
              item?.company_value ??
              null,

            sectorValue:
              item?.sector_value ??
              null
          })
        );


      res.json({
        ok: true,

        configured:
          true,

        symbol,

        exchange,

        marketType:
          "stocks",

        company: {
          name:
            instrument.name,

          profile:
            typeof profile.company_profile ===
            "string"
              ? profile.company_profile
              : "",

          sector:
            profile.sector ||
            "",

          sectorMarketCapInr:
            profile.sector_market_cap_inr ??
            null,

          sectorMarketCapUsd:
            profile.sector_market_cap_usd ??
            null
        },

        ratios,

        provider:
          "UPSTOX",

        note:
          "Company fundamentals are a separate context layer and do not automatically override technical analysis."
      });

    } catch (
      error
    ) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Stock fundamental analysis error"
        });
    }
  }
);


/* =========================================
   FOREX NEWS / SENTIMENT BRAIN
   ========================================= */

const FOREX_NEWS_CACHE_TTL =
  5 * 60 * 1000;


const FOREX_NEWS_ARTICLE_CACHE_TTL =
  30 * 60 * 1000;


const forexNewsCache =
  new Map();


const forexNewsArticleCache =
  new Map();


const FOREX_NEWS_FEEDS = {

  USD: [
    {
      source:
        "FED",

      name:
        "Federal Reserve Monetary Policy",

      url:
        "https://www.federalreserve.gov/feeds/press_monetary.xml"
    }
  ],

  EUR: [
    {
      source:
        "ECB",

      name:
        "European Central Bank",

      url:
        "https://www.ecb.europa.eu/rss/press.html"
    }
  ]
};


function decodeXmlEntities(
  value
) {

  return String(
    value ||
    ""
  )
    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )
    .replace(
      /&#(\d+);/g,
      (
        match,
        code
      ) => {

        const n =
          Number(
            code
          );

        return Number.isFinite(
          n
        )
          ? String.fromCodePoint(
              n
            )
          : match;
      }
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        match,
        code
      ) => {

        const n =
          parseInt(
            code,
            16
          );

        return Number.isFinite(
          n
        )
          ? String.fromCodePoint(
              n
            )
          : match;
      }
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&apos;/gi,
      "'"
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    );
}


function cleanNewsText(
  value
) {

  return decodeXmlEntities(
    value
  )
    .replace(
      /<[^>]*>/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function rssField(
  item,
  tag
) {

  const pattern =
    new RegExp(
      "<" +
        tag +
        "(?:\\s[^>]*)?>" +
        "([\\s\\S]*?)" +
        "<\\/" +
        tag +
        ">",
      "i"
    );


  const match =
    String(
      item ||
      ""
    ).match(
      pattern
    );


  return match
    ? cleanNewsText(
        match[1]
      )
    : "";
}


function classifyForexNewsImpact(
  text
) {

  const value =
    String(
      text ||
      ""
    ).toLowerCase();


  const highPatterns = [
    "fomc statement",
    "monetary policy decision",
    "monetary policy decisions",
    "monetary policy statement",
    "fomc statement",
    "interest rate decision",
    "key ecb interest rates",
    "deposit facility rate",
    "interest rates",
    "economic projections",
    "rate increase",
    "rate hike",
    "rate cut",
    "raises rates",
    "cuts rates"
  ];


  if (
    highPatterns.some(
      pattern =>
        value.includes(
          pattern
        )
    )
  ) {
    return "HIGH";
  }


  const mediumPatterns = [
    "inflation",
    "consumer prices",
    "wage",
    "wages",
    "economic outlook",
    "economy",
    "economic growth",
    "growth",
    "employment",
    "unemployment",
    "financial stability",
    "macroeconomic",
    "gdp",
    "labour market",
    "labor market"
  ];


  if (
    mediumPatterns.some(
      pattern =>
        value.includes(
          pattern
        )
    )
  ) {
    return "MEDIUM";
  }


  return "LOW";
}


function classifyCentralBankTone(
  text
) {

  const value =
    String(
      text ||
      ""
    )
      .toLowerCase()
      .replace(
        /\s+/g,
        " "
      );


  let hawkish = 0;

  let dovish = 0;


  const strongHawkish = [
    "decided to raise the target range",
    "raise the target range",
    "decided to increase interest rates",
    "raised interest rates",
    "raises interest rates",
    "rate hike",
    "rate increase",
    "further tightening",
    "additional tightening",
    "tighten monetary policy"
  ];


  const strongDovish = [
    "decided to lower the target range",
    "lower the target range",
    "decided to reduce interest rates",
    "reduced interest rates",
    "cuts interest rates",
    "rate cut",
    "policy easing",
    "ease monetary policy",
    "further easing",
    "additional easing"
  ];


  for (
    const phrase of strongHawkish
  ) {

    if (
      value.includes(
        phrase
      )
    ) {
      hawkish += 4;
    }
  }


  for (
    const phrase of strongDovish
  ) {

    if (
      value.includes(
        phrase
      )
    ) {
      dovish += 4;
    }
  }


  const hawkishContext = [
    "inflation remains elevated",
    "inflation remains too high",
    "inflation pressures",
    "persistent inflation",
    "upside risks to inflation",
    "restrictive monetary policy",
    "restrictive policy stance",
    "wage pressures",
    "price pressures"
  ];


  const dovishContext = [
    "inflation has declined",
    "inflation is declining",
    "disinflation",
    "downside risks to growth",
    "weaker economic activity",
    "economic slowdown",
    "labour market has weakened",
    "labor market has weakened",
    "rising unemployment"
  ];


  for (
    const phrase of hawkishContext
  ) {

    if (
      value.includes(
        phrase
      )
    ) {
      hawkish += 1;
    }
  }


  for (
    const phrase of dovishContext
  ) {

    if (
      value.includes(
        phrase
      )
    ) {
      dovish += 1;
    }
  }


  if (
    hawkish >=
      dovish + 2 &&
    hawkish >= 3
  ) {
    return "HAWKISH";
  }


  if (
    dovish >=
      hawkish + 2 &&
    dovish >= 3
  ) {
    return "DOVISH";
  }


  return "NEUTRAL / UNRESOLVED";
}


function allowedOfficialNewsUrl(
  link,
  source
) {

  try {

    const url =
      new URL(
        link
      );


    if (
      url.protocol !==
      "https:"
    ) {
      return false;
    }


    const host =
      url.hostname
        .toLowerCase();


    if (
      source === "FED"
    ) {

      return (
        host ===
          "federalreserve.gov" ||
        host.endsWith(
          ".federalreserve.gov"
        )
      );
    }


    if (
      source === "ECB"
    ) {

      return (
        host ===
          "ecb.europa.eu" ||
        host.endsWith(
          ".ecb.europa.eu"
        )
      );
    }


    return false;

  } catch {

    return false;
  }
}


function extractOfficialArticleText(
  html
) {

  let source =
    String(
      html ||
      ""
    );


  const mainMatch =
    source.match(
      /<main\b[^>]*>([\s\S]*?)<\/main>/i
    );


  const articleMatch =
    source.match(
      /<article\b[^>]*>([\s\S]*?)<\/article>/i
    );


  if (
    mainMatch?.[1]
  ) {

    source =
      mainMatch[1];

  } else if (
    articleMatch?.[1]
  ) {

    source =
      articleMatch[1];
  }


  return decodeXmlEntities(
    source
      .replace(
        /<!--([\s\S]*?)-->/g,
        " "
      )
      .replace(
        /<script\b[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style\b[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<noscript\b[\s\S]*?<\/noscript>/gi,
        " "
      )
      .replace(
        /<svg\b[\s\S]*?<\/svg>/gi,
        " "
      )
      .replace(
        /<nav\b[\s\S]*?<\/nav>/gi,
        " "
      )
      .replace(
        /<header\b[\s\S]*?<\/header>/gi,
        " "
      )
      .replace(
        /<footer\b[\s\S]*?<\/footer>/gi,
        " "
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      50000
    );
}


async function fetchOfficialNewsArticle(
  item
) {

  const link =
    String(
      item?.link ||
      ""
    ).trim();


  const source =
    String(
      item?.source ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    !link ||
    !allowedOfficialNewsUrl(
      link,
      source
    )
  ) {

    return {
      ok: false,

      error:
        "Official article URL not allowed"
    };
  }


  const cached =
    forexNewsArticleCache.get(
      link
    );


  if (
    cached &&
    Date.now() -
      cached.time <
      FOREX_NEWS_ARTICLE_CACHE_TTL
  ) {

    return {
      ok: true,

      text:
        cached.text,

      sourceState:
        "CACHE"
    };
  }


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      10000
    );


  try {

    const response =
      await fetch(
        link,
        {
          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "AITradingAnalyst/1.0"
          }
        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        source +
        " article HTTP " +
        response.status
      );
    }


    const html =
      await response.text();


    const text =
      extractOfficialArticleText(
        html
      );


    if (
      text.length <
      100
    ) {

      throw new Error(
        "Official article body too short"
      );
    }


    forexNewsArticleCache.set(
      link,
      {
        time:
          Date.now(),

        text
      }
    );


    return {
      ok: true,

      text,

      sourceState:
        "LIVE"
    };

  } finally {

    clearTimeout(
      timer
    );
  }
}


function parseForexNewsRss(
  xml,
  currency,
  feed
) {

  const items =
    String(
      xml ||
      ""
    ).match(
      /<item\b[\s\S]*?<\/item>/gi
    ) ||
    [];


  const result = [];


  for (
    const item of items
  ) {

    const title =
      rssField(
        item,
        "title"
      );


    if (!title) {
      continue;
    }


    const description =
      rssField(
        item,
        "description"
      );


    const link =
      rssField(
        item,
        "link"
      );


    const publishedRaw =
      rssField(
        item,
        "pubDate"
      );


    const timestamp =
      Date.parse(
        publishedRaw
      );


    if (
      !Number.isFinite(
        timestamp
      )
    ) {
      continue;
    }


    const contextText =
      title +
      " " +
      description;


    result.push({
      currency,

      source:
        feed.source,

      sourceName:
        feed.name,

      title,

      description:
        description.slice(
          0,
          600
        ),

      link,

      publishedAt:
        new Date(
          timestamp
        ).toISOString(),

      impact:
        classifyForexNewsImpact(
          contextText
        ),

      tone:
        classifyCentralBankTone(
          contextText
        ),

      toneBasis:
        "RSS HEADLINE",

      articleAnalyzed:
        false
    });
  }


  return result;
}


async function fetchForexNewsFeed(
  currency,
  feed
) {

  const key =
    currency +
    "|" +
    feed.url;


  const cached =
    forexNewsCache.get(
      key
    );


  if (
    cached &&
    Date.now() -
      cached.time <
      FOREX_NEWS_CACHE_TTL
  ) {

    return {
      ...cached.value,

      sourceState:
        "CACHE"
    };
  }


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  try {

    const response =
      await fetch(
        feed.url,
        {
          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "AITradingAnalyst/1.0"
          }
        }
      );


    if (!response.ok) {

      throw new Error(
        feed.source +
        " RSS HTTP " +
        response.status
      );
    }


    const xml =
      await response.text();


    const items =
      parseForexNewsRss(
        xml,
        currency,
        feed
      );


    const value = {
      ok: true,

      currency,

      source:
        feed.source,

      sourceName:
        feed.name,

      sourceState:
        "LIVE",

      items
    };


    forexNewsCache.set(
      key,
      {
        time:
          Date.now(),

        value
      }
    );


    return value;

  } finally {

    clearTimeout(
      timer
    );
  }
}


function newsRecencyWeight(
  publishedAt
) {

  const time =
    Date.parse(
      publishedAt
    );


  if (
    !Number.isFinite(
      time
    )
  ) {
    return 0.25;
  }


  const ageHours =
    Math.max(
      0,
      (
        Date.now() -
        time
      ) /
      (
        60 *
        60 *
        1000
      )
    );


  if (
    ageHours <= 24
  ) {
    return 1;
  }


  if (
    ageHours <= 72
  ) {
    return 0.8;
  }


  if (
    ageHours <= 168
  ) {
    return 0.5;
  }


  return 0.25;
}


function newsEventFamily(
  item
) {

  const title =
    String(
      item?.title ||
      ""
    )
      .toLowerCase();


  const policyPatterns = [
    "fomc statement",
    "monetary policy statement",
    "monetary policy decisions",
    "monetary policy decision",
    "interest rate decision",
    "economic projections"
  ];


  if (
    policyPatterns.some(
      pattern =>
        title.includes(
          pattern
        )
    )
  ) {
    return "POLICY_EVENT";
  }


  return "";
}


function pairNewsSentiment(
  base,
  quote,
  items
) {

  const grouped =
    new Map();


  for (
    const item of items
  ) {

    if (
      item.tone !== "HAWKISH" &&
      item.tone !== "DOVISH"
    ) {
      continue;
    }


    const direction =
      item.tone === "HAWKISH"
        ? 1
        : -1;


    const impactWeight =
      item.impact === "HIGH"
        ? 2
        : item.impact === "MEDIUM"
          ? 1
          : 0.5;


    const recencyWeight =
      newsRecencyWeight(
        item.publishedAt
      );


    const rawScore =
      direction *
      impactWeight *
      recencyWeight;


    const family =
      newsEventFamily(
        item
      );


    let key;


    if (
      family
    ) {

      const time =
        Date.parse(
          item.publishedAt
        );


      const day =
        Number.isFinite(
          time
        )
          ? new Date(
              time
            )
              .toISOString()
              .slice(
                0,
                10
              )
          : "UNKNOWN";


      key =
        [
          item.currency,
          day,
          family
        ].join(
          "|"
        );

    } else {

      key =
        [
          item.currency,
          item.link ||
            item.title
        ].join(
          "|"
        );
    }


    if (
      !grouped.has(
        key
      )
    ) {

      grouped.set(
        key,
        {
          currency:
            item.currency,

          scores:
            [],

          items:
            []
        }
      );
    }


    const group =
      grouped.get(
        key
      );


    group.scores.push(
      rawScore
    );


    group.items.push({
      title:
        item.title,

      tone:
        item.tone,

      impact:
        item.impact,

      publishedAt:
        item.publishedAt,

      recencyWeight:
        Number(
          recencyWeight.toFixed(
            2
          )
        )
    });
  }


  const currencyScore = {
    [base]: 0,
    [quote]: 0
  };


  const contributors = [];


  for (
    const group of grouped.values()
  ) {

    const groupScore =
      group.scores.length
        ? group.scores.reduce(
            (
              total,
              value
            ) =>
              total +
              value,
            0
          ) /
          group.scores.length
        : 0;


    currencyScore[
      group.currency
    ] =
      (
        currencyScore[
          group.currency
        ] ||
        0
      ) +
      groupScore;


    contributors.push({
      currency:
        group.currency,

      score:
        Number(
          groupScore.toFixed(
            2
          )
        ),

      groupedItems:
        group.items
    });
  }


  const baseScore =
    currencyScore[
      base
    ] ||
    0;


  const quoteScore =
    currencyScore[
      quote
    ] ||
    0;


  const pairScore =
    baseScore -
    quoteScore;


  let state =
    "MIXED / NEUTRAL";


  if (
    pairScore >= 2
  ) {
    state =
      "BULLISH TILT";
  }


  if (
    pairScore <= -2
  ) {
    state =
      "BEARISH TILT";
  }


  return {
    state,

    pairScore:
      Number(
        pairScore.toFixed(
          2
        )
      ),

    baseScore:
      Number(
        baseScore.toFixed(
          2
        )
      ),

    quoteScore:
      Number(
        quoteScore.toFixed(
          2
        )
      ),

    contributors,

    scoringModel:
      "Impact × recency, with same-day central-bank policy items grouped to avoid double counting.",

    note:
      "Directional tone is a news-context heuristic, not a trade signal."
  };
}


function calculateNewsRisk(
  items
) {

  const now =
    Date.now();


  const withinHours =
    (
      item,
      hours
    ) => {

      const time =
        Date.parse(
          item.publishedAt
        );


      if (
        !Number.isFinite(
          time
        )
      ) {
        return false;
      }


      const age =
        now -
        time;


      return (
        age >= 0 &&
        age <=
          hours *
            60 *
            60 *
            1000
      );
    };


  if (
    items.some(
      item =>
        item.impact ===
          "HIGH" &&
        withinHours(
          item,
          48
        )
    )
  ) {
    return "HIGH";
  }


  if (
    items.some(
      item =>
        (
          item.impact ===
            "HIGH" &&
          withinHours(
            item,
            168
          )
        ) ||
        (
          item.impact ===
            "MEDIUM" &&
          withinHours(
            item,
            48
          )
        )
    )
  ) {
    return "MEDIUM";
  }


  if (
    items.length
  ) {
    return "LOW";
  }


  return "NONE";
}



/* =========================================
   INDIAN STOCK NEWS / SENTIMENT BRAIN
   ========================================= */

async function fetchUpstoxStockNews(
  symbol,
  exchange = "NSE"
) {

  const token =
    String(
      process.env.UPSTOX_ACCESS_TOKEN ||
      ""
    ).trim();


  if (!token) {
    throw new Error(
      "Upstox access token is not configured"
    );
  }


  const instrument =
    await resolveUpstoxInstrument(
      symbol,
      exchange
    );


  if (
    !instrument?.instrumentKey
  ) {
    throw new Error(
      "Upstox stock instrument could not be resolved"
    );
  }


  const url =
    new URL(
      "https://api.upstox.com/v2/news"
    );


  url.searchParams.set(
    "category",
    "instrument_keys"
  );

  url.searchParams.set(
    "instrument_keys",
    instrument.instrumentKey
  );

  url.searchParams.set(
    "page_number",
    "1"
  );

  url.searchParams.set(
    "page_size",
    "30"
  );


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  try {

    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json",

            Authorization:
              `Bearer ${token}`
          },

          signal:
            controller.signal
        }
      );


    const payload =
      await response.json();


    if (
      !response.ok ||
      payload?.status !== "success"
    ) {
      throw new Error(
        payload?.errors?.[0]?.message ||
        payload?.message ||
        `Upstox news HTTP ${response.status}`
      );
    }


    const rawItems =
      payload?.data?.[
        instrument.instrumentKey
      ];


    const articles =
      Array.isArray(
        rawItems
      )
        ? rawItems
        : [];


    const items =
      articles
        .map(
          article => {

            const timestamp =
              Number(
                article.published_time
              );


            const publishedAt =
              Number.isFinite(
                timestamp
              )
                ? new Date(
                    timestamp
                  ).toISOString()
                : "";


            const title =
              String(
                article.heading ||
                ""
              ).trim();


            const summary =
              String(
                article.summary ||
                ""
              ).trim();


            const text =
              [
                title,
                summary
              ]
                .filter(Boolean)
                .join(" ");


            const relevance =
              classifyStockNewsRelevance(
                text,
                symbol,
                instrument.name
              );


            return {
              currency:
                symbol,

              symbol,

              source:
                "UPSTOX",

              title,

              summary,

              link:
                String(
                  article.article_link ||
                  ""
                ).trim(),

              thumbnail:
                String(
                  article.thumbnail ||
                  ""
                ).trim(),

              publishedAt,

              relevance,

              impact:
                classifyStockNewsImpact(
                  text,
                  relevance
                ),

              tone:
                classifyStockNewsTone(
                  text,
                  symbol,
                  instrument.name
                )
            };
          }
        )
        .filter(
          item =>
            item.title &&
            item.publishedAt
        );


    return {
      instrument,
      items
    };

  } finally {

    clearTimeout(
      timeout
    );
  }
}


function classifyStockNewsRelevance(
  text,
  symbol,
  companyName
) {

  const value =
    String(
      text || ""
    )
      .toLowerCase()
      .replace(/\s+/g, " ");


  const symbolValue =
    String(
      symbol || ""
    ).toLowerCase();


  const companyValue =
    String(
      companyName || ""
    )
      .toLowerCase()
      .replace(
        /\b(limited|ltd|india)\b/g,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();


  if (
    (
      symbolValue &&
      value.includes(
        symbolValue
      )
    ) ||
    (
      companyValue &&
      companyValue.length >= 4 &&
      value.includes(
        companyValue
      )
    )
  ) {
    return "DIRECT";
  }


  return "MARKET";
}


function classifyStockNewsImpact(
  text,
  relevance
) {

  const value =
    String(
      text || ""
    ).toLowerCase();


  const highPatterns = [
    "quarterly results",
    "financial results",
    "earnings",
    "profit warning",
    "guidance cut",
    "cuts guidance",
    "guidance raised",
    "raises guidance",
    "merger",
    "acquisition",
    "takeover",
    "buyback",
    "share buyback",
    "fraud",
    "default",
    "bankruptcy",
    "insolvency",
    "sebi order",
    "regulatory action",
    "investigation",
    "promoter stake sale"
  ];


  if (
    highPatterns.some(
      pattern =>
        value.includes(
          pattern
        )
    )
  ) {
    return "HIGH";
  }


  const mediumPatterns = [
    "order win",
    "wins order",
    "new order",
    "contract",
    "partnership",
    "dividend",
    "bonus issue",
    "stock split",
    "stake",
    "investment",
    "launch",
    "expansion",
    "approval",
    "rating upgrade",
    "rating downgrade",
    "target price",
    "gains",
    "rises",
    "jumps",
    "surges",
    "falls",
    "drops",
    "declines"
  ];


  if (
    mediumPatterns.some(
      pattern =>
        value.includes(
          pattern
        )
    )
  ) {
    return "MEDIUM";
  }


  return relevance === "DIRECT"
    ? "MEDIUM"
    : "LOW";
}


function classifyStockNewsTone(
  text,
  symbol = "",
  companyName = ""
) {

  const value =
    String(
      text || ""
    )
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();


  const symbolValue =
    String(
      symbol || ""
    )
      .toLowerCase()
      .trim();


  const companyWords =
    String(
      companyName || ""
    )
      .toLowerCase()
      .replace(
        /\b(limited|ltd|india|industries|corporation|company)\b/g,
        " "
      )
      .replace(
        /[^a-z0-9&]+/g,
        " "
      )
      .split(/\s+/)
      .filter(
        word =>
          word.length >= 4
      );


  const targetTerms =
    Array.from(
      new Set(
        [
          symbolValue,
          ...companyWords
        ].filter(Boolean)
      )
    );


  let targetText = "";


  for (
    const term of targetTerms
  ) {

    const index =
      value.indexOf(
        term
      );


    if (
      index !== -1
    ) {

      const before =
        Math.max(
          0,
          index - 45
        );


      const after =
        Math.min(
          value.length,
          index +
            term.length +
            65
        );


      targetText +=
        " " +
        value.slice(
          before,
          after
        );
    }
  }


  const scoringText =
    targetText.trim() ||
    value;


  let bullish = 0;
  let bearish = 0;


  const strongBullish = [
    "record profit",
    "profit jumps",
    "profit surges",
    "beats estimates",
    "beats expectations",
    "raises guidance",
    "guidance raised",
    "order win",
    "wins order",
    "buyback",
    "rating upgrade",
    "upgraded",
    "strong growth"
  ];


  const strongBearish = [
    "profit warning",
    "profit falls",
    "profit drops",
    "misses estimates",
    "misses expectations",
    "cuts guidance",
    "guidance cut",
    "rating downgrade",
    "downgraded",
    "fraud",
    "default",
    "bankruptcy",
    "insolvency",
    "regulatory action"
  ];


  for (
    const phrase of strongBullish
  ) {
    if (
      scoringText.includes(
        phrase
      )
    ) {
      bullish += 2;
    }
  }


  for (
    const phrase of strongBearish
  ) {
    if (
      scoringText.includes(
        phrase
      )
    ) {
      bearish += 2;
    }
  }


  const bullishPatterns = [
    "gain",
    "gains",
    "rise",
    "rises",
    "jump",
    "jumps",
    "surge",
    "surges",
    "growth",
    "expansion",
    "approval",
    "partnership",
    "dividend",
    "profit rises",
    "revenue rises"
  ];


  const bearishPatterns = [
    "fall",
    "falls",
    "drop",
    "drops",
    "decline",
    "declines",
    "loss",
    "losses",
    "weak demand",
    "investigation",
    "penalty",
    "fine",
    "stake sale",
    "profit declines",
    "revenue falls"
  ];


  for (
    const phrase of bullishPatterns
  ) {
    if (
      scoringText.includes(
        phrase
      )
    ) {
      bullish += 1;
    }
  }


  for (
    const phrase of bearishPatterns
  ) {
    if (
      scoringText.includes(
        phrase
      )
    ) {
      bearish += 1;
    }
  }


  if (
    bullish > bearish &&
    bullish >= 1
  ) {
    return "BULLISH";
  }


  if (
    bearish > bullish &&
    bearish >= 1
  ) {
    return "BEARISH";
  }


  return "NEUTRAL / UNRESOLVED";
}

function stockNewsSentiment(
  items
) {

  const scores = [];


  for (
    const item of items
  ) {

    let direction = 0;


    if (
      item.tone === "BULLISH"
    ) {
      direction = 1;
    }


    if (
      item.tone === "BEARISH"
    ) {
      direction = -1;
    }


    if (!direction) {
      continue;
    }


    const impactWeight =
      item.impact === "HIGH"
        ? 2
        : item.impact === "MEDIUM"
          ? 1
          : 0.5;


    const relevanceWeight =
      item.relevance === "DIRECT"
        ? 1
        : 0.6;


    const recencyWeight =
      newsRecencyWeight(
        item.publishedAt
      );


    scores.push(
      direction *
      impactWeight *
      relevanceWeight *
      recencyWeight
    );
  }


  const rawScore =
    scores.reduce(
      (
        total,
        value
      ) =>
        total + value,
      0
    );


  const divisor =
    Math.max(
      1,
      Math.sqrt(
        scores.length
      )
    );


  const normalizedScore =
    Math.max(
      -3,
      Math.min(
        3,
        rawScore / divisor
      )
    );


  let state =
    "MIXED / NEUTRAL";


  if (
    normalizedScore >= 1
  ) {
    state =
      "BULLISH TILT";
  }


  if (
    normalizedScore <= -1
  ) {
    state =
      "BEARISH TILT";
  }


  return {
    state,

    pairScore:
      Number(
        normalizedScore.toFixed(
          2
        )
      ),

    rawScore:
      Number(
        rawScore.toFixed(
          2
        )
      ),

    contributorCount:
      scores.length,

    scoringModel:
      "Stock-news tone × impact × relevance × recency.",

    note:
      "Directional tone is a news-context heuristic, not a trade signal."
  };
}


/* =========================================
   CRYPTO NEWS / SENTIMENT BRAIN
   ========================================= */

const CRYPTO_NEWS_CACHE_TTL =
  5 * 60 * 1000;


const cryptoNewsCache =
  new Map();


const CRYPTO_NEWS_FEEDS = [
  {
    source:
      "COINDESK",

    sourceName:
      "CoinDesk",

    url:
      "https://www.coindesk.com/arc/outboundfeeds/rss/"
  },

  {
    source:
      "COINTELEGRAPH",

    sourceName:
      "Cointelegraph",

    url:
      "https://cointelegraph.com/rss"
  }
];


const CRYPTO_ASSET_TERMS = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "ether", "eth"],
  SOL: ["solana", "sol"],
  XRP: ["xrp", "ripple"],
  BNB: ["bnb", "binance coin"],
  DOGE: ["dogecoin", "doge"],
  ADA: ["cardano", "ada"],
  LTC: ["litecoin", "ltc"],
  BCH: ["bitcoin cash", "bch"],
  LINK: ["chainlink", "link"],
  AVAX: ["avalanche", "avax"],
  DOT: ["polkadot", "dot"],
  TRX: ["tron", "trx"],
  TON: ["toncoin", "ton"],
  XLM: ["stellar", "xlm"],
  SHIB: ["shiba inu", "shib"],
  SUI: ["sui"]
};


function cryptoAssetTerms(
  base
) {

  const symbol =
    String(
      base ||
      ""
    )
      .trim()
      .toUpperCase();


  return (
    CRYPTO_ASSET_TERMS[
      symbol
    ] ||
    [
      symbol.toLowerCase()
    ]
  );
}


function containsNewsTerm(
  text,
  term
) {

  const value =
    String(
      text ||
      ""
    ).toLowerCase();


  const cleanTerm =
    String(
      term ||
      ""
    )
      .trim()
      .toLowerCase();


  if (!cleanTerm) {
    return false;
  }


  if (
    cleanTerm.includes(
      " "
    )
  ) {

    return value.includes(
      cleanTerm
    );
  }


  const pattern =
    new RegExp(
      "(^|[^a-z0-9])" +
        cleanTerm +
        "([^a-z0-9]|$)",
      "i"
    );


  return pattern.test(
    value
  );
}


function classifyCryptoNewsRelevance(
  text,
  base
) {

  const value =
    String(
      text ||
      ""
    ).toLowerCase();


  const directTerms =
    cryptoAssetTerms(
      base
    );


  if (
    directTerms.some(
      term =>
        containsNewsTerm(
          value,
          term
        )
    )
  ) {
    return "DIRECT";
  }


  /*
   * MARKET relevance is intentionally strict.
   * Generic mentions of "crypto" alone are not enough,
   * otherwise unrelated altcoin stories can distort BTC.
   */
  const marketPatterns = [
    "crypto market",
    "digital asset market",
    "crypto regulation",
    "cryptocurrency regulation",
    "crypto tax",
    "crypto bill",
    "crypto legislation",
    "federal reserve",
    "fomc",
    "fed rate",
    "interest rate",
    "rate hike",
    "rate cut",
    "monetary policy",
    "risk assets",
    "securities and exchange commission",
    "crypto reserve",
    "strategic bitcoin reserve",
    "stablecoin regulation"
  ];


  if (
    marketPatterns.some(
      pattern =>
        value.includes(
          pattern
        )
    )
  ) {
    return "MARKET";
  }


  return "NONE";
}


function classifyCryptoNewsImpact(
  text,
  relevance
) {

  const value =
    String(
      text ||
      ""
    ).toLowerCase();


  const highPatterns = [
    "rate hike",
    "raises rates",
    "rate cut",
    "cuts rates",
    "interest rate decision",
    "etf approved",
    "etf approval",
    "etf rejected",
    "etf rejection",
    "hack",
    "hacked",
    "exploit",
    "security breach",
    "lawsuit",
    "criminal charges",
    "ban",
    "banned",
    "liquidation",
    "liquidations",
    "bankruptcy"
  ];


  if (
    highPatterns.some(
      pattern =>
        value.includes(
          pattern
        )
    )
  ) {
    return "HIGH";
  }


  const mediumPatterns = [
    "regulation",
    "regulatory",
    "lawmakers",
    "tax bill",
    "tax overhaul",
    "institutional",
    "custody",
    "inflow",
    "inflows",
    "outflow",
    "outflows",
    "listing",
    "delisting",
    "upgrade",
    "hard fork",
    "stablecoin",
    "reserve",
    "adoption",
    "surges",
    "jumps",
    "rallies",
    "falls",
    "drops",
    "plunges"
  ];


  if (
    mediumPatterns.some(
      pattern =>
        value.includes(
          pattern
        )
    )
  ) {
    return "MEDIUM";
  }


  return relevance ===
    "DIRECT"
      ? "MEDIUM"
      : "LOW";
}


function classifyCryptoNewsTone(
  text
) {

  const value =
    String(
      text ||
      ""
    )
      .toLowerCase()
      .replace(
        /\s+/g,
        " "
      );


  let bullish = 0;

  let bearish = 0;


  const strongBullish = [
    "etf approved",
    "etf approval",
    "rate cut",
    "cuts rates",
    "rallies",
    "surges",
    "jumps",
    "soars",
    "record high",
    "all-time high",
    "breakout",
    "institutional adoption",
    "institutional demand",
    "strong inflows"
  ];


  const strongBearish = [
    "etf rejected",
    "etf rejection",
    "rate hike",
    "raises rates",
    "crashes",
    "plunges",
    "selloff",
    "sell-off",
    "hack",
    "hacked",
    "exploit",
    "security breach",
    "stolen",
    "strong outflows",
    "bankruptcy"
  ];


  for (const phrase of strongBullish) {
    if (value.includes(phrase)) {
      bullish += 2;
    }
  }


  for (const phrase of strongBearish) {
    if (value.includes(phrase)) {
      bearish += 2;
    }
  }


  const bullishPatterns = [
    "gains",
    "rises",
    "rise",
    "bullish",
    "adoption",
    "inflows",
    "buying",
    "accumulation",
    "expands",
    "growth",
    "launches"
  ];


  const bearishPatterns = [
    "falls",
    "drops",
    "declines",
    "bearish",
    "outflows",
    "selling",
    "liquidations",
    "lawsuit",
    "charges",
    "ban",
    "delisting",
    "losses"
  ];


  for (const phrase of bullishPatterns) {
    if (value.includes(phrase)) {
      bullish += 1;
    }
  }


  for (const phrase of bearishPatterns) {
    if (value.includes(phrase)) {
      bearish += 1;
    }
  }


  if (
    bullish > bearish &&
    bullish >= 2
  ) {
    return "BULLISH";
  }


  if (
    bearish > bullish &&
    bearish >= 2
  ) {
    return "BEARISH";
  }


  return "NEUTRAL / UNRESOLVED";
}


function parseCryptoNewsRss(
  xml,
  feed,
  base
) {

  const rssItems =
    String(
      xml ||
      ""
    ).match(
      /<item\b[\s\S]*?<\/item>/gi
    ) ||
    [];


  const items = [];


  for (const item of rssItems) {

    const title =
      rssField(
        item,
        "title"
      );


    if (!title) {
      continue;
    }


    const description =
      rssField(
        item,
        "description"
      );


    const link =
      rssField(
        item,
        "link"
      );


    const publishedRaw =
      rssField(
        item,
        "pubDate"
      );


    const timestamp =
      Date.parse(
        publishedRaw
      );


    if (
      !Number.isFinite(
        timestamp
      )
    ) {
      continue;
    }


    const context =
      title +
      " " +
      description;


    const relevance =
      classifyCryptoNewsRelevance(
        context,
        base
      );


    if (
      relevance ===
      "NONE"
    ) {
      continue;
    }


    items.push({
      currency:
        base,

      asset:
        base,

      source:
        feed.source,

      sourceName:
        feed.sourceName,

      title,

      description:
        description.slice(
          0,
          600
        ),

      link,

      publishedAt:
        new Date(
          timestamp
        ).toISOString(),

      relevance,

      impact:
        classifyCryptoNewsImpact(
          context,
          relevance
        ),

      tone:
        classifyCryptoNewsTone(
          context
        ),

      toneBasis:
        "RSS HEADLINE / DESCRIPTION",

      articleAnalyzed:
        false
    });
  }


  return items;
}


async function fetchCryptoNewsFeed(
  feed,
  base
) {

  const key =
    base +
    "|" +
    feed.url;


  const cached =
    cryptoNewsCache.get(
      key
    );


  if (
    cached &&
    Date.now() -
      cached.time <
      CRYPTO_NEWS_CACHE_TTL
  ) {

    return {
      ...cached.value,
      sourceState:
        "CACHE"
    };
  }


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  try {

    const response =
      await fetch(
        feed.url,
        {
          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "AITradingAnalyst/1.0"
          }
        }
      );


    if (!response.ok) {
      throw new Error(
        feed.source +
        " RSS HTTP " +
        response.status
      );
    }


    const xml =
      await response.text();


    const items =
      parseCryptoNewsRss(
        xml,
        feed,
        base
      );


    const value = {
      ok: true,

      source:
        feed.source,

      sourceName:
        feed.sourceName,

      sourceState:
        "LIVE",

      items
    };


    cryptoNewsCache.set(
      key,
      {
        time:
          Date.now(),

        value
      }
    );


    return value;

  } finally {

    clearTimeout(
      timer
    );
  }
}


function cryptoNewsStoryFamily(
  item
) {

  const title =
    String(
      item?.title ||
      ""
    )
      .toLowerCase();


  const macroRatePatterns = [
    "federal reserve",
    "fomc",
    "fed ",
    "rate hike",
    "rate cut",
    "interest rate",
    "tightening",
    "monetary policy"
  ];


  if (
    macroRatePatterns.some(
      pattern =>
        title.includes(
          pattern
        )
    )
  ) {
    return "MACRO_RATES";
  }


  return "";
}


function cryptoNewsSentiment(
  base,
  items
) {

  const grouped =
    new Map();


  for (
    const item of items
  ) {

    let direction = 0;


    if (
      item.tone ===
      "BULLISH"
    ) {
      direction = 1;
    }


    if (
      item.tone ===
      "BEARISH"
    ) {
      direction = -1;
    }


    if (!direction) {
      continue;
    }


    const impactWeight =
      item.impact === "HIGH"
        ? 2
        : item.impact === "MEDIUM"
          ? 1
          : 0.5;


    const relevanceWeight =
      item.relevance ===
        "DIRECT"
        ? 1
        : 0.6;


    const recencyWeight =
      newsRecencyWeight(
        item.publishedAt
      );


    const contribution =
      direction *
      impactWeight *
      relevanceWeight *
      recencyWeight;


    const family =
      cryptoNewsStoryFamily(
        item
      );


    let key;


    if (
      family
    ) {

      const timestamp =
        Date.parse(
          item.publishedAt
        );


      const day =
        Number.isFinite(
          timestamp
        )
          ? new Date(
              timestamp
            )
              .toISOString()
              .slice(
                0,
                10
              )
          : "UNKNOWN";


      key =
        [
          base,
          day,
          family
        ].join(
          "|"
        );

    } else {

      key =
        [
          base,
          item.link ||
            item.title
        ].join(
          "|"
        );
    }


    if (
      !grouped.has(
        key
      )
    ) {

      grouped.set(
        key,
        {
          family:
            family ||
            "INDIVIDUAL",

          scores:
            [],

          items:
            []
        }
      );
    }


    const group =
      grouped.get(
        key
      );


    group.scores.push(
      contribution
    );


    group.items.push({
      source:
        item.source,

      title:
        item.title,

      tone:
        item.tone,

      impact:
        item.impact,

      relevance:
        item.relevance,

      publishedAt:
        item.publishedAt,

      rawScore:
        Number(
          contribution.toFixed(
            2
          )
        )
    });
  }


  const contributors = [];

  const groupScores = [];


  for (
    const group of grouped.values()
  ) {

    const groupScore =
      group.scores.length
        ? group.scores.reduce(
            (
              total,
              value
            ) =>
              total +
              value,
            0
          ) /
          group.scores.length
        : 0;


    groupScores.push(
      groupScore
    );


    contributors.push({
      family:
        group.family,

      score:
        Number(
          groupScore.toFixed(
            2
          )
        ),

      groupedItems:
        group.items
    });
  }


  const rawGroupedScore =
    groupScores.reduce(
      (
        total,
        value
      ) =>
        total +
        value,
      0
    );


  /*
   * Multiple independent stories can strengthen conviction,
   * but score growth is dampened by sqrt(group count).
   */
  const divisor =
    Math.max(
      1,
      Math.sqrt(
        groupScores.length
      )
    );


  let normalizedScore =
    rawGroupedScore /
    divisor;


  normalizedScore =
    Math.max(
      -3,
      Math.min(
        3,
        normalizedScore
      )
    );


  let state =
    "MIXED / NEUTRAL";


  if (
    normalizedScore >= 1
  ) {
    state =
      "BULLISH TILT";
  }


  if (
    normalizedScore <= -1
  ) {
    state =
      "BEARISH TILT";
  }


  return {
    state,

    pairScore:
      Number(
        normalizedScore.toFixed(
          2
        )
      ),

    rawGroupedScore:
      Number(
        rawGroupedScore.toFixed(
          2
        )
      ),

    groupCount:
      groupScores.length,

    baseScore:
      Number(
        normalizedScore.toFixed(
          2
        )
      ),

    quoteScore:
      0,

    contributors,

    scoringModel:
      "Tone × impact × recency × asset relevance; same-day macro-rate stories are grouped, then the final score is normalized to a controlled -3 to +3 range.",

    note:
      "Crypto news sentiment is a context heuristic, not a trade signal."
  };
}


async function buildCryptoNewsResponse(
  symbol,
  base,
  quote,
  days
) {

  const settled =
    await Promise.allSettled(
      CRYPTO_NEWS_FEEDS.map(
        feed =>
          fetchCryptoNewsFeed(
            feed,
            base
          )
      )
    );


  const providers = [];

  const allItems = [];


  for (
    let i = 0;
    i < settled.length;
    i++
  ) {

    const result =
      settled[i];

    const feed =
      CRYPTO_NEWS_FEEDS[i];


    if (
      result.status ===
      "fulfilled"
    ) {

      providers.push({
        source:
          result.value.source,

        sourceName:
          result.value.sourceName,

        status:
          "OK",

        sourceState:
          result.value.sourceState
      });


      allItems.push(
        ...result.value.items
      );

    } else {

      providers.push({
        source:
          feed.source,

        sourceName:
          feed.sourceName,

        status:
          "ERROR",

        error:
          result.reason?.message ||
          "Crypto news source unavailable"
      });
    }
  }


  const cutoff =
    Date.now() -
    days *
      24 *
      60 *
      60 *
      1000;


  const seen =
    new Set();


  const items =
    allItems
      .filter(
        item =>
          Date.parse(
            item.publishedAt
          ) >= cutoff
      )
      .sort(
        (a, b) =>
          Date.parse(
            b.publishedAt
          ) -
          Date.parse(
            a.publishedAt
          )
      )
      .filter(
        item => {

          const normalizedTitle =
            String(
              item.title ||
              ""
            )
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                " "
              )
              .trim();


          if (
            !normalizedTitle ||
            seen.has(
              normalizedTitle
            )
          ) {
            return false;
          }


          seen.add(
            normalizedTitle
          );

          return true;
        }
      );


  const sentiment =
    cryptoNewsSentiment(
      base,
      items
    );


  const risk =
    calculateNewsRisk(
      items
    );


  const highImpact =
    items.filter(
      item =>
        item.impact ===
        "HIGH"
    ).length;


  const mediumImpact =
    items.filter(
      item =>
        item.impact ===
        "MEDIUM"
    ).length;


  return {
    ok: true,

    configured:
      true,

    symbol,

    base,

    quote,

    marketType:
      "crypto",

    rangeDays:
      days,

    providers,

    summary: {
      total:
        items.length,

      highImpact,

      mediumImpact,

      newsRisk:
        risk,

      sentiment:
        sentiment.state,

      pairScore:
        sentiment.pairScore
    },

    sentiment,

    items:
      items.slice(
        0,
        30
      ),

    note:
      "Crypto news uses CoinDesk and Cointelegraph RSS context. Impact, relevance and sentiment are engine heuristics and do not automatically override technical analysis."
  };
}


app.get(
  "/api/news",
  async (
    req,
    res
  ) => {

    try {

      const symbol =
        String(
          req.query.symbol ||
          ""
        )
          .trim()
          .toUpperCase();


      const earlyMarketType =
        String(
          req.query.marketType ||
          ""
        )
          .trim()
          .toLowerCase();


      if (
        earlyMarketType ===
        "stocks"
      ) {

        if (
          !/^[A-Z0-9&.-]{1,30}$/.test(
            symbol
          )
        ) {

          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Stock news expects a valid Indian stock symbol"
            });
        }


        const exchange =
          String(
            req.query.exchange ||
            "NSE"
          )
            .trim()
            .toUpperCase();


        if (
          exchange !== "NSE" &&
          exchange !== "BSE"
        ) {

          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Stock exchange must be NSE or BSE"
            });
        }


        const stockDays =
          Math.max(
            1,
            Math.min(
              14,
              Number(
                req.query.days
              ) || 7
            )
          );


        const result =
          await fetchUpstoxStockNews(
            symbol,
            exchange
          );


        const cutoff =
          Date.now() -
          stockDays *
            24 *
            60 *
            60 *
            1000;


        const items =
          result.items
            .filter(
              item => {

                const time =
                  Date.parse(
                    item.publishedAt
                  );


                return (
                  Number.isFinite(
                    time
                  ) &&
                  time >= cutoff
                );
              }
            )
            .sort(
              (
                a,
                b
              ) =>
                Date.parse(
                  b.publishedAt
                ) -
                Date.parse(
                  a.publishedAt
                )
            );


        const sentiment =
          stockNewsSentiment(
            items
          );


        const risk =
          calculateNewsRisk(
            items
          );


        const highImpact =
          items.filter(
            item =>
              item.impact ===
              "HIGH"
          ).length;


        const mediumImpact =
          items.filter(
            item =>
              item.impact ===
              "MEDIUM"
          ).length;


        return res.json({
          ok: true,

          configured: true,

          symbol,

          exchange,

          marketType:
            "stocks",

          rangeDays:
            stockDays,

          company: {
            name:
              result.instrument.name ||
              symbol,

            instrumentKey:
              result.instrument.instrumentKey,

            isin:
              result.instrument.isin ||
              ""
          },

          providers: [
            {
              source:
                "UPSTOX",

              sourceName:
                "Upstox News",

              status:
                "OK",

              sourceState:
                "LIVE"
            }
          ],

          summary: {
            total:
              items.length,

            highImpact,

            mediumImpact,

            newsRisk:
              risk,

            sentiment:
              sentiment.state,

            pairScore:
              sentiment.pairScore
          },

          sentiment,

          items:
            items.slice(
              0,
              30
            ),

          note:
            "Indian stock news is provided by Upstox. Impact, relevance and sentiment are heuristic context and do not automatically override technical analysis."
        });
      }


      if (
        !/^[A-Z0-9]{2,12}\/[A-Z0-9]{2,12}$/.test(
          symbol
        )
      ) {

        return res
          .status(400)
          .json({
            ok: false,

            error:
              "News analysis expects a pair like EUR/USD, BTC/USD or DOGE/USD"
          });
      }


      const [
        base,
        quote
      ] =
        symbol.split(
          "/"
        );


      const days =
        Math.max(
          1,
          Math.min(
            14,
            Number(
              req.query.days
            ) || 7
          )
        );


      const requestedMarketType =
        String(
          req.query.marketType ||
          ""
        )
          .trim()
          .toLowerCase();


      const knownForexPair =
        Boolean(
          FOREX_CURRENCY_COUNTRY[
            base
          ] &&
          FOREX_CURRENCY_COUNTRY[
            quote
          ]
        );


      const marketType =
        requestedMarketType ===
          "crypto"
          ? "crypto"
          : requestedMarketType ===
              "forex"
            ? "forex"
            : knownForexPair
              ? "forex"
              : "crypto";


      if (
        marketType ===
        "crypto"
      ) {

        const cryptoResponse =
          await buildCryptoNewsResponse(
            symbol,
            base,
            quote,
            days
          );


        return res.json(
          cryptoResponse
        );
      }


      const currencies =
        Array.from(
          new Set(
            [
              base,
              quote
            ]
          )
        );


      const feedJobs = [];


      for (
        const currency of currencies
      ) {

        const feeds =
          FOREX_NEWS_FEEDS[
            currency
          ] ||
          [];


        for (
          const feed of feeds
        ) {

          feedJobs.push(
            {
              currency,
              feed
            }
          );
        }
      }


      const settled =
        await Promise.allSettled(
          feedJobs.map(
            job =>
              fetchForexNewsFeed(
                job.currency,
                job.feed
              )
          )
        );


      const providers = [];

      const allItems = [];


      for (
        let i = 0;
        i <
        settled.length;
        i++
      ) {

        const result =
          settled[i];

        const job =
          feedJobs[i];


        if (
          result.status ===
          "fulfilled"
        ) {

          providers.push({
            currency:
              job.currency,

            source:
              result.value.source,

            sourceName:
              result.value.sourceName,

            status:
              "OK",

            sourceState:
              result.value.sourceState
          });


          allItems.push(
            ...result.value.items
          );

        } else {

          providers.push({
            currency:
              job.currency,

            source:
              job.feed.source,

            sourceName:
              job.feed.name,

            status:
              "ERROR",

            error:
              result.reason?.message ||
              "News source unavailable"
          });
        }
      }


      const cutoff =
        Date.now() -
        days *
          24 *
          60 *
          60 *
          1000;


      const seen =
        new Set();


      const items =
        allItems
          .filter(
            item =>
              Date.parse(
                item.publishedAt
              ) >=
              cutoff
          )
          .sort(
            (
              a,
              b
            ) =>
              Date.parse(
                b.publishedAt
              ) -
              Date.parse(
                a.publishedAt
              )
          )
          .filter(
            item => {

              const key =
                (
                  item.link ||
                  item.title
                )
                  .trim()
                  .toLowerCase();


              if (
                !key ||
                seen.has(
                  key
                )
              ) {
                return false;
              }


              seen.add(
                key
              );

              return true;
            }
          );


      const articleCandidates =
        items
          .filter(
            item =>
              item.impact ===
                "HIGH" ||
              item.impact ===
                "MEDIUM"
          )
          .slice(
            0,
            10
          );


      const articleResults =
        await Promise.allSettled(
          articleCandidates.map(
            item =>
              fetchOfficialNewsArticle(
                item
              )
          )
        );


      for (
        let i = 0;
        i <
        articleCandidates.length;
        i++
      ) {

        const item =
          articleCandidates[i];

        const result =
          articleResults[i];


        if (
          result.status ===
            "fulfilled" &&
          result.value?.ok
        ) {

          item.tone =
            classifyCentralBankTone(
              result.value.text
            );


          item.toneBasis =
            "OFFICIAL ARTICLE";


          item.articleAnalyzed =
            true;


          item.articleSourceState =
            result.value.sourceState;

        } else {

          item.articleAnalyzed =
            false;


          item.articleError =
            result.status ===
              "rejected"
              ? (
                  result.reason?.message ||
                  "Article analysis failed"
                )
              : (
                  result.value?.error ||
                  "Article analysis unavailable"
                );
        }
      }


      const sentiment =
        pairNewsSentiment(
          base,
          quote,
          items
        );


      const risk =
        calculateNewsRisk(
          items
        );


      const highImpact =
        items.filter(
          item =>
            item.impact ===
            "HIGH"
        ).length;


      const mediumImpact =
        items.filter(
          item =>
            item.impact ===
            "MEDIUM"
        ).length;


      res.json({
        ok: true,

        configured:
          feedJobs.length > 0,

        symbol,

        marketType:
          "forex",

        rangeDays:
          days,

        supportedCurrencies:
          Object.keys(
            FOREX_NEWS_FEEDS
          ),

        providers,

        summary: {
          total:
            items.length,

          highImpact,

          mediumImpact,

          newsRisk:
            risk,

          sentiment:
            sentiment.state,

          pairScore:
            sentiment.pairScore
        },

        sentiment,

        items:
          items.slice(
            0,
            30
          ),

        note:
          "News is a separate context layer. Impact and tone classifications are engine heuristics and do not automatically override technical analysis."
      });

    } catch (
      error
    ) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "News analysis error"
        });
    }
  }
);


function parseTime(
  value
) {

  if (
    !value ||
    typeof value !==
      "string"
  ) {
    return NaN;
  }

  if (
    value.length === 10
  ) {

    return Date.parse(
      value +
      "T00:00:00Z"
    );
  }

  const normalized =
    value.replace(
      " ",
      "T"
    );

  /*
   * Preserve provider timezone when
   * timestamp already contains Z or
   * an explicit UTC offset.
   */
  if (
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(
      normalized
    )
  ) {

    return Date.parse(
      normalized
    );
  }

  /*
   * Existing Twelve Data timestamps
   * are interpreted as UTC.
   */
  return Date.parse(
    normalized + "Z"
  );
}


function removeIncomplete(
  candles,
  interval
) {

  const duration =
    INTERVAL_MS[
      interval
    ];

  if (!duration) {
    return candles;
  }

  const now =
    Date.now();

  while (
    candles.length
  ) {

    const last =
      candles[
        candles.length - 1
      ];

    const start =
      parseTime(
        last.time
      );

    if (
      !Number.isFinite(
        start
      )
    ) {
      break;
    }

    if (
      start +
        duration <=
      now
    ) {
      break;
    }

    candles.pop();
  }

  return candles;
}


function aggregateCandles(
  candles,
  timeframeMs
) {

  const out = [];

  let bucket =
    null;

  let current =
    null;

  for (
    const c of candles
  ) {

    const time =
      parseTime(
        c.time
      );

    if (
      !Number.isFinite(
        time
      )
    ) {
      continue;
    }

    const nextBucket =
      Math.floor(
        time /
        timeframeMs
      ) *
      timeframeMs;

    if (
      bucket === null ||
      nextBucket !==
        bucket
    ) {

      if (current) {
        out.push(
          current
        );
      }

      bucket =
        nextBucket;

      current = {
        time:
          new Date(
            bucket
          )
            .toISOString(),

        open:
          c.open,

        high:
          c.high,

        low:
          c.low,

        close:
          c.close,

        volume:
          c.volume || 0
      };

    } else {

      current.high =
        Math.max(
          current.high,
          c.high
        );

      current.low =
        Math.min(
          current.low,
          c.low
        );

      current.close =
        c.close;

      current.volume +=
        c.volume || 0;
    }
  }

  if (
    current &&
    bucket +
      timeframeMs <=
      Date.now()
  ) {

    out.push(
      current
    );
  }

  return out;
}



/* === UPSTOX HISTORICAL CANDLES === */

const UPSTOX_INTERVALS = {
  "15min": {
    unit: "minutes",
    value: "15"
  },

  "1h": {
    unit: "hours",
    value: "1"
  },

  "4h": {
    unit: "hours",
    value: "4"
  },

  "1day": {
    unit: "days",
    value: "1"
  }
};


function formatUpstoxDate(
  value
) {

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return date
    .toISOString()
    .slice(0, 10);
}


async function fetchUpstoxHistoricalRange(
  instrumentKey,
  interval,
  fromDate,
  toDate
) {

  const config =
    UPSTOX_INTERVALS[
      interval
    ];

  if (!config) {

    throw new Error(
      "Unsupported Upstox interval"
    );
  }

  const token =
    String(
      process.env
        .UPSTOX_ACCESS_TOKEN ||
      ""
    ).trim();

  if (!token) {

    throw new Error(
      "Upstox is not authorized"
    );
  }

  const url =
    "https://api.upstox.com/v3/historical-candle/" +
    encodeURIComponent(
      instrumentKey
    ) +
    "/" +
    config.unit +
    "/" +
    config.value +
    "/" +
    formatUpstoxDate(
      toDate
    ) +
    "/" +
    formatUpstoxDate(
      fromDate
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );

  let response;

  try {

    response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json",

            Authorization:
              "Bearer " +
              token
          },

          signal:
            controller.signal
        }
      );

  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {

      throw new Error(
        "Upstox request timed out"
      );
    }

    throw new Error(
      "Upstox network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }

  let data;

  try {

    data =
      JSON.parse(
        await response.text()
      );

  } catch {

    throw new Error(
      "Upstox returned an invalid response"
    );
  }

  if (
    !response.ok ||
    data.status !== "success"
  ) {

    throw new Error(
      data?.errors?.[0]?.message ||
      (
        "Upstox request failed (" +
        response.status +
        ")"
      )
    );
  }

  if (
    !Array.isArray(
      data?.data?.candles
    )
  ) {

    throw new Error(
      "Upstox returned no candle data"
    );
  }

  return data.data.candles;
}



async function fetchUpstoxCandles(
  symbol,
  interval,
  exchange,
  outputsize
) {

  if (!UPSTOX_INTERVALS[interval]) {
    throw new Error(
      "Unsupported Upstox interval"
    );
  }

  const validated =
    validateMarketInput(
      symbol,
      exchange
    );

  const cleanSymbol =
    validated.symbol;

  const cleanExchange =
    validated.exchange ||
    "NSE";

  if (
    cleanExchange !== "NSE" &&
    cleanExchange !== "BSE"
  ) {
    throw new Error(
      "Upstox candle routing requires NSE or BSE"
    );
  }

  const limit =
    Math.max(
      50,
      Math.min(
        5000,
        Number(outputsize) ||
          500
      )
    );

  const cacheKey =
    [
      "UPSTOX",
      cleanSymbol,
      cleanExchange,
      interval,
      limit
    ].join("|");

  const cached =
    marketCache.get(
      cacheKey
    );

  if (
    cached &&
    Date.now() <
      cached.expiresAt
  ) {
    return {
      candles:
        cached.candles,
      source:
        "UPSTOX CACHE"
    };
  }

  if (cached) {
    marketCache.delete(
      cacheKey
    );
  }

  const instrument =
    await resolveUpstoxInstrument(
      cleanSymbol,
      cleanExchange
    );

  /*
   * Keep every request inside
   * Upstox V3 historical limits.
   *
   * 15m  -> 28-day chunks
   * 1h/4h -> 85-day chunks
   * 1day -> large multi-year chunk
   */
  const chunkDays =
    interval === "15min"
      ? 28
      : interval === "1h" ||
          interval === "4h"
        ? 85
        : 3650;

  /*
   * Calendar history required to
   * comfortably cover weekends and
   * exchange holidays.
   */
  const estimatedDays =
    interval === "15min"
      ? Math.ceil(
          limit / 25 * 1.7
        )
      : interval === "1h"
        ? Math.ceil(
            limit / 7 * 1.7
          )
        : interval === "4h"
          ? Math.ceil(
              limit / 2 * 1.7
            )
          : Math.ceil(
              limit / 0.68 * 1.15
            );

  const maxHistoryDays =
    interval === "1day"
      ? 3650
      : Math.max(
          chunkDays,
          estimatedDays
        );

  const end =
    new Date();

  const earliest =
    new Date(
      end.getTime() -
      maxHistoryDays *
        24 *
        60 *
        60 *
        1000
    );

  const rows = [];

  let cursorEnd =
    new Date(end);

  while (
    cursorEnd >= earliest &&
    rows.length < limit
  ) {

    const cursorStart =
      new Date(
        Math.max(
          earliest.getTime(),
          cursorEnd.getTime() -
            chunkDays *
              24 *
              60 *
              60 *
              1000
        )
      );

    const batch =
      await fetchUpstoxHistoricalRange(
        instrument.instrumentKey,
        interval,
        cursorStart,
        cursorEnd
      );

    rows.push(
      ...batch
    );

    cursorEnd =
      new Date(
        cursorStart.getTime() -
        24 *
          60 *
          60 *
          1000
      );
  }

  const normalized =
    rows
      .map(
        row => {

          if (
            !Array.isArray(row) ||
            row.length < 5
          ) {
            return null;
          }

          const timestamp =
            String(
              row[0] || ""
            );

          const timeMs =
            parseTime(
              timestamp
            );

          const open =
            Number(row[1]);

          const high =
            Number(row[2]);

          const low =
            Number(row[3]);

          const close =
            Number(row[4]);

          const rawVolume =
            Number(row[5]);

          const volume =
            Number.isFinite(
              rawVolume
            ) &&
            rawVolume >= 0
              ? rawVolume
              : 0;

          const candle = {
            time:
              timestamp,
            open,
            high,
            low,
            close,
            volume
          };

          if (
            !Number.isFinite(
              timeMs
            ) ||
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            open <= 0 ||
            high <= 0 ||
            low <= 0 ||
            close <= 0 ||
            high < low ||
            high <
              Math.max(
                open,
                close
              ) ||
            low >
              Math.min(
                open,
                close
              )
          ) {
            return null;
          }

          return {
            timeMs,
            candle
          };
        }
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.timeMs -
          b.timeMs
      );

  const unique =
    new Map();

  for (const item of normalized) {
    unique.set(
      item.timeMs,
      item.candle
    );
  }

  let candles =
    Array.from(
      unique.entries()
    )
      .sort(
        (a, b) =>
          a[0] - b[0]
      )
      .map(
        entry =>
          entry[1]
      );

  candles =
    removeIncomplete(
      candles,
      interval
    );

  if (
    candles.length > limit
  ) {
    candles =
      candles.slice(
        -limit
      );
  }

  if (!candles.length) {
    throw new Error(
      "No valid closed candles returned by Upstox"
    );
  }

  const savedAt =
    Date.now();

  setBoundedCache(
    marketCache,
    cacheKey,
    {
      savedAt,

      expiresAt:
        cacheExpiryForInterval(
          interval,
          savedAt
        ),

      candles
    },
    MAX_MARKET_CACHE_ENTRIES
  );

  return {
    candles,
    source:
      "UPSTOX REST"
  };
}


async function fetchMarketCandles(
  symbol,
  interval,
  exchange,
  outputsize
) {

  const cleanExchange =
    String(
      exchange || ""
    )
      .trim()
      .toUpperCase();

  if (
    cleanExchange === "NSE" ||
    cleanExchange === "BSE"
  ) {
    return fetchUpstoxCandles(
      symbol,
      interval,
      cleanExchange,
      outputsize
    );
  }

  return fetchTwelveCandles(
    symbol,
    interval,
    exchange,
    outputsize
  );
}


async function fetchTwelveCandles(
  symbol,
  interval,
  exchange,
  outputsize
) {

  const apiKey =
    getActiveKey();

  if (!apiKey) {

    throw new Error(
      "Twelve Data API key is not configured."
    );
  }


  if (
    !INTERVAL_MS[
      interval
    ]
  ) {

    throw new Error(
      "Unsupported interval"
    );
  }


  const validated =
    validateMarketInput(
      symbol,
      exchange
    );

  const cleanSymbol =
    validated.symbol;

  const cleanExchange =
    validated.exchange;


  const limit =
    Math.max(
      50,
      Math.min(
        5000,
        Number(outputsize) ||
          500
      )
    );


  const cacheKey =
    [
      cleanSymbol,
      cleanExchange,
      interval,
      limit
    ].join("|");


  const cached =
    marketCache.get(
      cacheKey
    );


  if (
    cached &&
    Date.now() <
      cached.expiresAt
  ) {

    return {
      candles:
        cached.candles,

      source:
        "CACHE"
    };
  }


  if (cached) {

    marketCache.delete(
      cacheKey
    );
  }


  const params =
    new URLSearchParams({
      symbol:
        cleanSymbol,

      interval,

      outputsize:
        String(limit),

      timezone:
        "UTC",

      apikey:
        apiKey
    });


  if (cleanExchange) {

    params.set(
      "exchange",
      cleanExchange
    );
  }


  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );


  let response;

  try {

    response =
      await fetch(
        "https://api.twelvedata.com/time_series?" +
          params.toString(),
        {
          signal:
            controller.signal
        }
      );

  } catch (error) {

    const causeCode =
      error?.cause?.code || "NO_CAUSE_CODE";
    const errorName =
      error?.name || "UnknownError";

    console.error(
      "[Twelve Data] Network diagnostic:",
      JSON.stringify({
        name: errorName,
        causeCode,
        message: String(error?.cause?.message || error?.message || "Unknown error").slice(0, 180)
      })
    );

    if (
      error &&
      error.name === "AbortError"
    ) {
      throw new Error("Twelve Data request timed out");
    }

    throw new Error(
      "Twelve Data network request failed"
    );

  } finally {

    clearTimeout(
      timeout
    );
  }


  let data;

  try {

    const body =
      await response.text();

    data =
      JSON.parse(
        body
      );

  } catch {

    throw new Error(
      "Twelve Data returned an invalid response"
    );
  }


  if (
    !response.ok ||
    data.status ===
      "error"
  ) {

    throw new Error(
      data.message ||
      (
        "Twelve Data request failed (" +
        response.status +
        ")"
      )
    );
  }


  if (
    !Array.isArray(
      data.values
    )
  ) {

    throw new Error(
      "Twelve Data returned no candle data"
    );
  }


  const normalized =
    data.values
      .map(
        row => {

          const time =
            parseTime(
              row.datetime
            );

          const open =
            Number(
              row.open
            );

          const high =
            Number(
              row.high
            );

          const low =
            Number(
              row.low
            );

          const close =
            Number(
              row.close
            );

          const rawVolume =
            Number(
              row.volume
            );

          const volume =
            Number.isFinite(
              rawVolume
            ) &&
            rawVolume >= 0
              ? rawVolume
              : 0;


          return {
            timeMs:
              time,

            candle: {
              time:
                row.datetime,

              open,
              high,
              low,
              close,
              volume
            }
          };
        }
      )
      .filter(
        item => {

          const c =
            item.candle;

          return (
            Number.isFinite(
              item.timeMs
            ) &&
            Number.isFinite(
              c.open
            ) &&
            Number.isFinite(
              c.high
            ) &&
            Number.isFinite(
              c.low
            ) &&
            Number.isFinite(
              c.close
            ) &&
            c.open > 0 &&
            c.high > 0 &&
            c.low > 0 &&
            c.close > 0 &&
            c.high >= c.low &&
            c.high >=
              Math.max(
                c.open,
                c.close
              ) &&
            c.low <=
              Math.min(
                c.open,
                c.close
              )
          );
        }
      )
      .sort(
        (a, b) =>
          a.timeMs -
          b.timeMs
      );


  /*
   * Duplicate timestamps:
   * keep the newest provider row.
   */
  const unique =
    new Map();

  for (
    const item of normalized
  ) {

    unique.set(
      item.timeMs,
      item.candle
    );
  }


  let candles =
    Array.from(
      unique.entries()
    )
      .sort(
        (a, b) =>
          a[0] - b[0]
      )
      .map(
        entry =>
          entry[1]
      );


  candles =
    removeIncomplete(
      candles,
      interval
    );


  if (
    candles.length === 0
  ) {

    throw new Error(
      "No valid closed candles returned by Twelve Data"
    );
  }


  const savedAt =
    Date.now();


  setBoundedCache(
    marketCache,
    cacheKey,
    {
      savedAt,

      expiresAt:
        cacheExpiryForInterval(
          interval,
          savedAt
        ),

      candles
    },
    MAX_MARKET_CACHE_ENTRIES
  );


  return {
    candles,
    source:
      "REST"
  };
}


app.get(
  "/api/candles",
  async (
    req,
    res
  ) => {

    try {

      const symbol =
        String(
          req.query.symbol ||
          "BTC/USD"
        ).trim();

      const interval =
        String(
          req.query.interval ||
          "1h"
        ).trim();

      const exchange =
        String(
          req.query.exchange ||
          ""
        ).trim();

      const result =
        await fetchMarketCandles(
          symbol,
          interval,
          exchange,
          req.query.outputsize ||
            500
        );

      res.json({
        ok: true,
        symbol,
        interval,
        exchange,

        source:
          result.source,

        count:
          result.candles
            .length,

        candles:
          result.candles
      });

    } catch (error) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Server error"
        });
    }
  }
);


app.get(
  "/api/mtf",
  async (
    req,
    res
  ) => {

    try {

      const symbol =
        String(
          req.query.symbol ||
          "BTC/USD"
        ).trim();

      const exchange =
        String(
          req.query.exchange ||
          ""
        ).trim();

      const m15 =
        await fetchMarketCandles(
          symbol,
          "15min",
          exchange,
          2400
        );

      const requests =
        await Promise.allSettled([
          fetchMarketCandles(
            symbol,
            "1h",
            exchange,
            1800
          ),

          fetchMarketCandles(
            symbol,
            "4h",
            exchange,
            1200
          ),

          fetchMarketCandles(
            symbol,
            "1day",
            exchange,
            730
          )
        ]);

      const h1 =
        requests[0]
          .status ===
          "fulfilled" &&
        requests[0]
          .value
          .candles
          .length >= 100
          ? requests[0]
              .value
          : {
              candles:
                aggregateCandles(
                  m15.candles,
                  INTERVAL_MS[
                    "1h"
                  ]
                ),

              source:
                "15m FALLBACK"
            };

      const h4 =
        requests[1]
          .status ===
          "fulfilled" &&
        requests[1]
          .value
          .candles
          .length >= 100
          ? requests[1]
              .value
          : {
              candles:
                aggregateCandles(
                  m15.candles,
                  INTERVAL_MS[
                    "4h"
                  ]
                ),

              source:
                "15m FALLBACK"
            };

      const dailyFallbackCandidates = [
        {
          candles:
            aggregateCandles(
              h4.candles,
              INTERVAL_MS[
                "1day"
              ]
            ),

          source:
            "4H → 1D FALLBACK"
        },

        {
          candles:
            aggregateCandles(
              h1.candles,
              INTERVAL_MS[
                "1day"
              ]
            ),

          source:
            "1H → 1D FALLBACK"
        },

        {
          candles:
            aggregateCandles(
              m15.candles,
              INTERVAL_MS[
                "1day"
              ]
            ),

          source:
            "15m → 1D FALLBACK"
        }
      ]
        .sort(
          (a, b) =>
            b.candles.length -
            a.candles.length
        );


      const bestDailyFallback =
        dailyFallbackCandidates[0];


      const d1 =
        requests[2]
          .status ===
          "fulfilled" &&
        requests[2]
          .value
          .candles
          .length >= 60
          ? requests[2]
              .value
          : bestDailyFallback;


      if (
        !d1 ||
        d1.candles.length < 60
      ) {

        throw new Error(
          "Insufficient Daily history for reliable MTF analysis"
        );
      }

      res.json({
        ok: true,
        symbol,
        exchange,

        frames: {
          m15,
          h1,
          h4,
          d1
        },

        counts: {
          m15:
            m15.candles
              .length,

          h1:
            h1.candles
              .length,

          h4:
            h4.candles
              .length,

          d1:
            d1.candles
              .length
        }
      });

    } catch (error) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "MTF data error"
        });
    }
  }
);



const {
  startTelegramTradeWatcher,
  getTelegramWatcherStatus
} = require("./telegram-watcher");


app.get(
  "/api/health",
  (
    req,
    res
  ) => {

    const watcher =
      getTelegramWatcherStatus();


    const ok =
      watcher.healthy;


    res
      .status(
        ok
          ? 200
          : 503
      )
      .json({
        ok,

        server: {
          status:
            "RUNNING",

          uptimeSeconds:
            Math.round(
              process.uptime()
            )
        },

        watcher
      });
  }
);



// Read-only signal history API.
app.get("/api/signal-history/export", (req, res) => {
  try {
    const history = exportSignalHistory();
    res.json({ ok: true, count: history.length, history });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Signal history export error"
    });
  }
});

app.get("/api/signal-history/stats", (req, res) => {
  try {
    res.json({ ok: true, stats: getSignalHistoryStats() });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Signal statistics error"
    });
  }
});

app.get("/api/signal-history", (req, res) => {
  try {
    const history = listSignalHistory({
      limit: req.query.limit,
      pair: req.query.pair,
      style: req.query.style,
      status: req.query.status
    });
    res.json({ ok: true, count: history.length, history });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Signal history error"
    });
  }
});

const server = app.listen(
  PORT,
  HOST,
  () => {

    console.log(
      `AI Trading Analyst Web running on http://${HOST}:${PORT}`
    );
  }
);


startTelegramTradeWatcher({
  fetchTwelveCandles: fetchMarketCandles
});



// === LIVE WS BRIDGE ===

const currentCandleCache =
  new Map();


app.get(
  "/api/current-candle",
  async (
    req,
    res
  ) => {

    try {

      const symbol =
        String(
          req.query.symbol ||
          "BTC/USD"
        ).trim();

      const exchange =
        String(
          req.query.exchange ||
          ""
        ).trim();

      const interval =
        String(
          req.query.interval ||
          "15min"
        ).trim();


      const validated =
        validateMarketInput(
          symbol,
          exchange
        );

      const cleanSymbol =
        validated.symbol;

      const cleanExchange =
        validated.exchange;


      if (
        !INTERVAL_MS[
          interval
        ]
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Unsupported interval"
          });
      }


      const apiKey =
        getActiveKey();


      if (!apiKey) {

        throw new Error(
          "Twelve Data API key is not configured"
        );
      }


      const cacheKey =
        [
          cleanSymbol,

          cleanExchange,

          interval
        ].join("|");


      const cached =
        currentCandleCache
          .get(
            cacheKey
          );


      if (
        cached &&
        Date.now() -
          cached.savedAt <
          5000
      ) {

        return res.json({
          ok: true,
          source:
            "SHORT CACHE",
          candle:
            cached.candle
        });
      }


      if (cached) {

        currentCandleCache
          .delete(
            cacheKey
          );
      }


      const params =
        new URLSearchParams({
          symbol:
            cleanSymbol,
          interval,
          outputsize:
            "2",
          timezone:
            "UTC",
          apikey:
            apiKey
        });


      if (cleanExchange) {

        params.set(
          "exchange",
          cleanExchange
        );
      }


      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          12000
        );


      let response;

      try {

        response =
          await fetch(
            "https://api.twelvedata.com/time_series?" +
              params.toString(),
            {
              signal:
                controller.signal
            }
          );

      } catch (error) {

        if (
          error &&
          error.name ===
            "AbortError"
        ) {

          throw new Error(
            "Current candle request timed out"
          );
        }

        throw new Error(
          "Current candle network request failed"
        );

      } finally {

        clearTimeout(
          timeout
        );
      }


      let data;

      try {

        const body =
          await response.text();

        data =
          JSON.parse(
            body
          );

      } catch {

        throw new Error(
          "Current candle provider returned invalid data"
        );
      }


      if (
        !response.ok ||
        data.status ===
          "error"
      ) {

        throw new Error(
          data.message ||
          (
            "Current candle request failed (" +
            response.status +
            ")"
          )
        );
      }


      if (
        !Array.isArray(
          data.values
        ) ||
        !data.values.length
      ) {

        throw new Error(
          "No current candle returned"
        );
      }


      const row =
        data.values[0];

      const candleTime =
        parseTime(
          row.datetime
        );

      const rawVolume =
        Number(
          row.volume
        );


      const candle = {
        time:
          row.datetime,

        open:
          Number(
            row.open
          ),

        high:
          Number(
            row.high
          ),

        low:
          Number(
            row.low
          ),

        close:
          Number(
            row.close
          ),

        volume:
          Number.isFinite(
            rawVolume
          ) &&
          rawVolume >= 0
            ? rawVolume
            : 0
      };


      if (
        !Number.isFinite(
          candleTime
        ) ||
        !Number.isFinite(
          candle.open
        ) ||
        !Number.isFinite(
          candle.high
        ) ||
        !Number.isFinite(
          candle.low
        ) ||
        !Number.isFinite(
          candle.close
        ) ||
        candle.open <= 0 ||
        candle.high <= 0 ||
        candle.low <= 0 ||
        candle.close <= 0 ||
        candle.high <
          candle.low ||
        candle.high <
          Math.max(
            candle.open,
            candle.close
          ) ||
        candle.low >
          Math.min(
            candle.open,
            candle.close
          )
      ) {

        throw new Error(
          "Invalid current candle"
        );
      }


      setBoundedCache(
        currentCandleCache,
        cacheKey,
        {
          savedAt:
            Date.now(),

          candle
        },
        MAX_CURRENT_CANDLE_CACHE_ENTRIES
      );


      res.json({
        ok: true,
        source:
          "TWELVE DATA REST",
        candle
      });


    } catch (
      error
    ) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "Current candle error"
        });
    }
  }
);


const browserLiveClients =
  new Set();


function sendLiveToClient(
  client,
  message
) {

  if (
    client &&
    client.readyState ===
      WebSocket.OPEN
  ) {

    client.send(
      JSON.stringify(
        message
      )
    );
  }
}


function stopClientUpstream(
  client
) {

  client._liveGeneration =
    Number(
      client._liveGeneration ||
      0
    ) + 1;


  if (
    client._upstreamHeartbeat
  ) {

    clearInterval(
      client._upstreamHeartbeat
    );

    client._upstreamHeartbeat =
      null;
  }


  if (
    client._reconnectTimer
  ) {

    clearTimeout(
      client._reconnectTimer
    );

    client._reconnectTimer =
      null;
  }


  client._reconnectAttempt =
    0;


  if (
    client._upstreamSocket
  ) {

    const socket =
      client._upstreamSocket;

    client._upstreamSocket =
      null;

    try {
      socket.close();
    } catch {
    }
  }
}


function scheduleClientReconnect(
  client,
  generation
) {

  if (
    client._liveGeneration !==
      generation ||
    client.readyState !==
      WebSocket.OPEN ||
    !client._liveSubscription
  ) {
    return;
  }


  if (
    client._reconnectTimer
  ) {
    return;
  }


  client._reconnectAttempt =
    Math.min(
      Number(
        client._reconnectAttempt ||
        0
      ) + 1,
      10
    );


  const delay =
    Math.min(
      30000,
      1000 *
        Math.pow(
          2,
          client._reconnectAttempt -
            1
        )
    );


  sendLiveToClient(
    client,
    {
      type:
        "status",

      status:
        "reconnecting",

      retryInMs:
        delay,

      attempt:
        client._reconnectAttempt
    }
  );


  client._reconnectTimer =
    setTimeout(
      () => {

        client._reconnectTimer =
          null;


        if (
          client._liveGeneration !==
            generation ||
          client.readyState !==
            WebSocket.OPEN ||
          !client._liveSubscription
        ) {
          return;
        }


        const subscription =
          client._liveSubscription;


        if (
          subscription.exchange ===
            "BINANCE"
        ) {

          startBinanceForClient(
            client,
            subscription.symbol,
            subscription.interval,
            generation
          );

          return;
        }


        startTwelveForClient(
          client,
          subscription.symbol,
          subscription.exchange,
          generation
        );
      },
      delay
    );
}


function toBinanceStreamSymbol(
  symbol
) {

  const cleaned =
    String(symbol || "")
      .trim()
      .toUpperCase();

  const parts =
    cleaned.split("/");

  if (parts.length === 2) {

    let base =
      parts[0]
        .replace(
          /[^A-Z0-9]/g,
          ""
        );

    let quote =
      parts[1]
        .replace(
          /[^A-Z0-9]/g,
          ""
        );

    if (
      quote === "USD"
    ) {

      quote =
        "USDT";
    }

    return (
      base +
      quote
    );
  }

  return cleaned
    .replace(
      /[^A-Z0-9]/g,
      ""
    );
}


function startBinanceForClient(
  client,
  symbol,
  interval,
  generation
) {

  const mapped =
    toBinanceStreamSymbol(
      symbol
    );

  const binanceInterval =
    interval === "1h"
      ? "1h"
      : "15m";


  sendLiveToClient(
    client,
    {
      type:
        "status",

      status:
        "connecting",

      provider:
        "BINANCE",

      mappedSymbol:
        mapped,

      interval:
        binanceInterval
    }
  );


  const streamName =
    mapped
      .toLowerCase() +
    "@kline_" +
    binanceInterval;

  const url =
    "wss://stream.binance.com:9443/ws/" +
    streamName;

  const socket =
    new WebSocket(
      url
    );

  client._upstreamSocket =
    socket;


  socket.on(
    "open",
    () => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      client._reconnectAttempt =
        0;


      sendLiveToClient(
        client,
        {
          type:
            "status",

          status:
            "connected",

          provider:
            "BINANCE",

          mappedSymbol:
            mapped,

          interval:
            binanceInterval
        }
      );
    }
  );


  socket.on(
    "message",
    raw => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      let message;

      try {

        message =
          JSON.parse(
            raw.toString()
          );

      } catch {
        return;
      }


      if (
        message.e !==
          "kline" ||
        !message.k
      ) {
        return;
      }

      const k =
        message.k;

      const candle = {
        time:
          new Date(
            Number(k.t)
          ).toISOString(),

        _bucket:
          Number(k.t),

        open:
          Number(k.o),

        high:
          Number(k.h),

        low:
          Number(k.l),

        close:
          Number(k.c),

        volume:
          Number(
            k.v || 0
          )
      };


      if (
        !Number.isFinite(
          candle.open
        ) ||
        !Number.isFinite(
          candle.high
        ) ||
        !Number.isFinite(
          candle.low
        ) ||
        !Number.isFinite(
          candle.close
        )
      ) {
        return;
      }


      sendLiveToClient(
        client,
        {
          type:
            "kline",

          provider:
            "BINANCE",

          symbol,

          mappedSymbol:
            mapped,

          interval:
            binanceInterval,

          closed:
            Boolean(k.x),

          candle
        }
      );
    }
  );


  socket.on(
    "error",
    error => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      sendLiveToClient(
        client,
        {
          type:
            "status",

          status:
            "error",

          provider:
            "BINANCE",

          message:
            error.message ||
            "Binance WebSocket error"
        }
      );
    }
  );


  socket.on(
    "close",
    () => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      client._upstreamSocket =
        null;

      sendLiveToClient(
        client,
        {
          type:
            "status",

          status:
            "closed",

          provider:
            "BINANCE"
        }
      );


      scheduleClientReconnect(
        client,
        generation
      );
    }
  );
}


function startTwelveForClient(
  client,
  symbol,
  exchange,
  generation
) {

  const apiKey =
    getActiveKey();


  if (!apiKey) {

    sendLiveToClient(
      client,
      {
        type:
          "status",

        status:
          "error",

        message:
          "API key not configured"
      }
    );

    return;
  }


  sendLiveToClient(
    client,
    {
      type:
        "status",

      status:
        "connecting",

      provider:
        "TWELVE DATA",

      symbol,

      exchange
    }
  );


  const url =
    "wss://ws.twelvedata.com/v1/quotes/price?apikey=" +
    encodeURIComponent(
      apiKey
    );

  const socket =
    new WebSocket(
      url
    );

  client._upstreamSocket =
    socket;


  socket.on(
    "open",
    () => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      socket.send(
        JSON.stringify({
          action:
            "subscribe",

          params: {
            symbols:
              symbol
          }
        })
      );


      client._upstreamHeartbeat =
        setInterval(
          () => {

            if (
              client._liveGeneration ===
                generation &&
              client._upstreamSocket ===
                socket &&
              socket.readyState ===
                WebSocket.OPEN
            ) {

              socket.send(
                JSON.stringify({
                  action:
                    "heartbeat"
                })
              );
            }

          },
          10000
        );


      client._reconnectAttempt =
        0;


      sendLiveToClient(
        client,
        {
          type:
            "status",

          status:
            "connected",

          provider:
            "TWELVE DATA",

          symbol,

          exchange
        }
      );
    }
  );


  socket.on(
    "message",
    raw => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      let message;

      try {

        message =
          JSON.parse(
            raw.toString()
          );

      } catch {
        return;
      }


      if (
        message.event ===
          "price" &&
        Number.isFinite(
          Number(
            message.price
          )
        )
      ) {

        sendLiveToClient(
          client,
          {
            type:
              "price",

            provider:
              "TWELVE DATA",

            symbol:
              message.symbol ||
              symbol,

            price:
              Number(
                message.price
              ),

            timestamp:
              Number(
                message.timestamp ||
                Math.floor(
                  Date.now() /
                  1000
                )
              ),

            exchange:
              message.exchange ||
              exchange ||
              ""
          }
        );

        return;
      }


      if (
        message.status ===
          "error" ||
        message.event ===
          "error"
      ) {

        sendLiveToClient(
          client,
          {
            type:
              "status",

            status:
              "error",

            provider:
              "TWELVE DATA",

            message:
              message.message ||
              "WebSocket subscription rejected"
          }
        );

        return;
      }


      if (
        message.event ===
          "subscribe-status"
      ) {

        sendLiveToClient(
          client,
          {
            type:
              "provider-status",

            provider:
              "TWELVE DATA",

            status:
              message.status ||
              "",

            message:
              message.message ||
              ""
          }
        );
      }
    }
  );


  socket.on(
    "error",
    error => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      sendLiveToClient(
        client,
        {
          type:
            "status",

          status:
            "error",

          provider:
            "TWELVE DATA",

          message:
            error.message ||
            "WebSocket error"
        }
      );
    }
  );


  socket.on(
    "close",
    () => {

      if (
        client._liveGeneration !==
          generation ||
        client._upstreamSocket !==
          socket
      ) {
        return;
      }

      if (
        client._upstreamHeartbeat
      ) {

        clearInterval(
          client._upstreamHeartbeat
        );

        client._upstreamHeartbeat =
          null;
      }

      client._upstreamSocket =
        null;

      sendLiveToClient(
        client,
        {
          type:
            "status",

          status:
            "closed",

          provider:
            "TWELVE DATA"
        }
      );


      scheduleClientReconnect(
        client,
        generation
      );
    }
  );
}


function startClientUpstream(
  client,
  symbol,
  exchange = "",
  interval = "15min"
) {

  stopClientUpstream(
    client
  );

  const generation =
    client._liveGeneration;

  const normalizedExchange =
    String(exchange || "")
      .trim()
      .toUpperCase();

  client._liveSubscription = {
    symbol,

    exchange:
      normalizedExchange,

    interval
  };


  if (
    normalizedExchange ===
      "BINANCE"
  ) {

    startBinanceForClient(
      client,
      symbol,
      interval,
      generation
    );

    return;
  }


  startTwelveForClient(
    client,
    symbol,
    normalizedExchange,
    generation
  );
}


const browserWss =
  new WebSocketServer({
    server,

    path:
      "/live"
  });


browserWss.on(
  "connection",
  client => {

    browserLiveClients.add(
      client
    );

    client._liveGeneration =
      0;

    client._upstreamSocket =
      null;

    client._upstreamHeartbeat =
      null;

    client._reconnectTimer =
      null;

    client._reconnectAttempt =
      0;

    client._liveSubscription =
      null;


    sendLiveToClient(
      client,
      {
        type:
          "status",

        status:
          "ready"
      }
    );


    client.on(
      "message",
      raw => {

        const rawSize =
          Buffer.isBuffer(
            raw
          )
            ? raw.length
            : Buffer.byteLength(
                String(raw)
              );


        if (
          rawSize >
            8192
        ) {

          sendLiveToClient(
            client,
            {
              type:
                "status",

              status:
                "error",

              message:
                "WebSocket message too large"
            }
          );

          return;
        }


        let message;

        try {

          message =
            JSON.parse(
              raw.toString()
            );

        } catch {

          sendLiveToClient(
            client,
            {
              type:
                "status",

              status:
                "error",

              message:
                "Invalid WebSocket message"
            }
          );

          return;
        }


        if (
          message.action !==
            "subscribe" ||
          typeof message.symbol !==
            "string"
        ) {
          return;
        }


        const interval =
          String(
            message.interval ||
            "15min"
          ).trim();


        if (
          !INTERVAL_MS[
            interval
          ]
        ) {

          sendLiveToClient(
            client,
            {
              type:
                "status",

              status:
                "error",

              message:
                "Unsupported interval"
            }
          );

          return;
        }


        let validated;

        try {

          validated =
            validateMarketInput(
              message.symbol,
              message.exchange ||
                ""
            );

        } catch (
          error
        ) {

          sendLiveToClient(
            client,
            {
              type:
                "status",

              status:
                "error",

              message:
                error.message ||
                "Invalid market input"
            }
          );

          return;
        }


        /*
         * Explicit non-Binance exchanges
         * are handled by exchange-specific
         * REST polling in workspace.js.
         *
         * Twelve Data generic WebSocket
         * must not silently return a
         * different exchange.
         */
        if (
          validated.exchange &&
          validated.exchange !==
            "BINANCE"
        ) {

          sendLiveToClient(
            client,
            {
              type:
                "status",

              status:
                "error",

              message:
                "Exchange-specific live WebSocket unavailable; use REST live polling"
            }
          );

          return;
        }


        startClientUpstream(
          client,
          validated.symbol,
          validated.exchange,
          interval
        );
      }
    );


    client.on(
      "close",
      () => {

        browserLiveClients.delete(
          client
        );

        stopClientUpstream(
          client
        );
      }
    );
  }
);
