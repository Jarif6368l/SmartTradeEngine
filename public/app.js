const $ =
  id =>
    document.getElementById(id);

const connectionBadge =
  $("connectionBadge");

const indiaApiBadge =
  $("indiaApiBadge");

const analyzeButton =
  $("analyzeButton");


if (indiaApiBadge) {

  indiaApiBadge.addEventListener(
    "click",
    () => {

      window.location.href =
        "/api/upstox/login";
    }
  );
}


async function checkStatus() {

  try {

    const response =
      await fetch(
        "/api/status"
      );

    const data =
      await response.json();

    if (data.apiConfigured) {

      connectionBadge.textContent =
        "API READY";

      connectionBadge.className =
        "badge ok";

    } else {

      connectionBadge.textContent =
        "API KEY NEEDED";

      connectionBadge.className =
        "badge error";
    }

    if (indiaApiBadge) {

      if (data.upstoxConfigured) {

        indiaApiBadge.textContent =
          "";

        indiaApiBadge.className =
          "badge india-api-badge ok";

      } else {

        indiaApiBadge.textContent =
          "";

        indiaApiBadge.className =
          "badge india-api-badge";
      }
    }

  } catch {

    connectionBadge.textContent =
      "SERVER ERROR";

    connectionBadge.className =
      "badge error";

    if (indiaApiBadge) {

      indiaApiBadge.textContent =
        "";

      indiaApiBadge.className =
        "badge india-api-badge error";
    }
  }
}


function isForexPair(symbol) {

  const parts =
    symbol
      .toUpperCase()
      .split("/");

  if (parts.length !== 2) {
    return false;
  }

  const fiat =
    new Set([
      "USD",
      "EUR",
      "GBP",
      "JPY",
      "CHF",
      "AUD",
      "NZD",
      "CAD",
      "INR",
      "SGD",
      "HKD"
    ]);

  return (
    fiat.has(parts[0]) &&
    fiat.has(parts[1])
  );
}


function formatPrice(
  value,
  symbol
) {

  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "--";
  }

  if (isForexPair(symbol)) {

    const digits =
      symbol
        .toUpperCase()
        .includes("JPY")
        ? 3
        : 5;

    return Number(value)
      .toLocaleString(
        undefined,
        {
          minimumFractionDigits:
            digits,
          maximumFractionDigits:
            digits
        }
      );
  }

  const abs =
    Math.abs(value);

  let digits = 2;

  if (abs < 1) {
    digits = 6;

  } else if (abs < 100) {
    digits = 4;
  }

  return Number(value)
    .toLocaleString(
      undefined,
      {
        minimumFractionDigits:
          digits,
        maximumFractionDigits:
          digits
      }
    );
}


function trendClass(
  trend
) {

  if (
    trend.includes(
      "BULLISH"
    )
  ) {
    return "bullish";
  }

  if (
    trend.includes(
      "BEARISH"
    )
  ) {
    return "bearish";
  }

  return "neutral";
}


function drawChart(
  candles
) {

  const chart =
    $("priceChart");

  chart.innerHTML =
    "";

  const recent =
    candles.slice(-80);

  if (
    recent.length < 2
  ) {

    chart.textContent =
      "Not enough candle data";

    return;
  }

  const width =
    1000;

  const height =
    300;

  const padTop =
    18;

  const padBottom =
    24;

  const padLeft =
    12;

  const padRight =
    12;

  const minPrice =
    Math.min(
      ...recent.map(
        c => c.low
      )
    );

  const maxPrice =
    Math.max(
      ...recent.map(
        c => c.high
      )
    );

  const priceRange =
    Math.max(
      maxPrice -
        minPrice,
      0.0000001
    );

  const plotHeight =
    height -
    padTop -
    padBottom;

  const plotWidth =
    width -
    padLeft -
    padRight;

  const slot =
    plotWidth /
    recent.length;

  const bodyWidth =
    Math.max(
      3,
      slot * 0.58
    );

  const y =
    price =>
      padTop +
      (
        maxPrice -
        price
      ) /
      priceRange *
      plotHeight;

  const svgNS =
    "http://www.w3.org/2000/svg";

  const svg =
    document.createElementNS(
      svgNS,
      "svg"
    );

  svg.setAttribute(
    "viewBox",
    `0 0 ${width} ${height}`
  );

  svg.setAttribute(
    "preserveAspectRatio",
    "none"
  );

  svg.classList.add(
    "candle-svg"
  );


  for (
    let i = 0;
    i < recent.length;
    i++
  ) {

    const c =
      recent[i];

    const bullish =
      c.close >=
      c.open;

    const x =
      padLeft +
      slot * i +
      slot / 2;

    const highY =
      y(c.high);

    const lowY =
      y(c.low);

    const openY =
      y(c.open);

    const closeY =
      y(c.close);


    const wick =
      document.createElementNS(
        svgNS,
        "line"
      );

    wick.setAttribute(
      "x1",
      x
    );

    wick.setAttribute(
      "x2",
      x
    );

    wick.setAttribute(
      "y1",
      highY
    );

    wick.setAttribute(
      "y2",
      lowY
    );

    wick.setAttribute(
      "class",
      bullish
        ? "candle-wick bull"
        : "candle-wick bear"
    );

    svg.appendChild(
      wick
    );


    const body =
      document.createElementNS(
        svgNS,
        "rect"
      );

    body.setAttribute(
      "x",
      x -
      bodyWidth / 2
    );

    body.setAttribute(
      "y",
      Math.min(
        openY,
        closeY
      )
    );

    body.setAttribute(
      "width",
      bodyWidth
    );

    body.setAttribute(
      "height",
      Math.max(
        2,
        Math.abs(
          closeY -
          openY
        )
      )
    );

    body.setAttribute(
      "rx",
      "1"
    );

    body.setAttribute(
      "class",
      bullish
        ? "candle-body bull"
        : "candle-body bear"
    );

    svg.appendChild(
      body
    );
  }


  const last =
    recent[
      recent.length - 1
    ];

  const priceY =
    y(last.close);


  const priceLine =
    document.createElementNS(
      svgNS,
      "line"
    );

  priceLine.setAttribute(
    "x1",
    padLeft
  );

  priceLine.setAttribute(
    "x2",
    width -
      padRight
  );

  priceLine.setAttribute(
    "y1",
    priceY
  );

  priceLine.setAttribute(
    "y2",
    priceY
  );

  priceLine.setAttribute(
    "class",
    "current-price-line"
  );

  svg.appendChild(
    priceLine
  );


  chart.appendChild(
    svg
  );


  const info =
    document.createElement(
      "div"
    );

  info.className =
    "chart-info";

  info.textContent =
    `Last 80 closed candles • Range ${formatPrice(
      minPrice,
      $("symbol").value.trim()
    )} — ${formatPrice(
      maxPrice,
      $("symbol").value.trim()
    )}`;

  chart.appendChild(
    info
  );
}


function renderStructure(
  structure,
  symbol
) {

  const trend =
    $("structureTrend");

  trend.textContent =
    structure.trend;

  trend.className =
    trendClass(
      structure.trend
    );

  const recent =
    structure.swings
      .slice(-8)
      .map(
        swing =>
          `${swing.label}  ${formatPrice(
            swing.price,
            symbol
          )}`
      )
      .join("\n");

  $("structureDetails")
    .textContent =
      structure.structure +
      "\n\n" +
      `Recent Bias: ${structure.recentBias}\n` +
      `Support: ${formatPrice(
        structure.support,
        symbol
      )}\n` +
      `Resistance: ${formatPrice(
        structure.resistance,
        symbol
      )}\n` +
      `Structure Event: ${structure.lastEvent}\n` +
      `Last Swing High: ${formatPrice(
        structure.lastSwingHigh,
        symbol
      )}\n` +
      `Last Swing Low: ${formatPrice(
        structure.lastSwingLow,
        symbol
      )}\n` +
      `Detected Swings: ${structure.swings.length}` +
      (
        recent
          ? "\n\nRECENT STRUCTURE\n" +
            recent
          : ""
      );
}


function renderPriceAction(
  priceAction
) {

  $("momentumState")
    .textContent =
      priceAction.momentum;

  $("momentumState")
    .className =
      trendClass(
        priceAction.momentum
      );

  $("priceActionDetails")
    .textContent =
      priceAction.evidence +
      "\n" +
      `Body: ${priceAction.bodyPercent.toFixed(1)}%\n` +
      `Upper Wick: ${priceAction.upperWickPercent.toFixed(1)}%\n` +
      `Lower Wick: ${priceAction.lowerWickPercent.toFixed(1)}%\n` +
      `Bull Power: ${priceAction.recentBullPower.toFixed(2)}\n` +
      `Bear Power: ${priceAction.recentBearPower.toFixed(2)}`;
}


function normalizeCandles(
  raw
) {

  if (!Array.isArray(raw)) {
    return [];
  }


  const normalized =
    raw
      .map(
        (c, index) => {

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


          let sortTime;

          if (
            typeof c.time ===
              "number"
          ) {

            sortTime =
              c.time;

          } else if (
            typeof c.time ===
              "string" &&
            c.time.trim() !== ""
          ) {

            const numericTime =
              Number(c.time);

            sortTime =
              Number.isFinite(
                numericTime
              )
                ? numericTime
                : Date.parse(
                    c.time
                  );

          } else {

            sortTime =
              NaN;
          }


          return {
            time:
              c.time,

            open,
            high,
            low,
            close,
            volume,

            _sortTime:
              sortTime,

            _index:
              index
          };
        }
      )
      .filter(
        c => {

          if (
            !Number.isFinite(
              c._sortTime
            ) ||
            !Number.isFinite(
              c.open
            ) ||
            !Number.isFinite(
              c.high
            ) ||
            !Number.isFinite(
              c.low
            ) ||
            !Number.isFinite(
              c.close
            )
          ) {
            return false;
          }


          if (
            c.open <= 0 ||
            c.high <= 0 ||
            c.low <= 0 ||
            c.close <= 0
          ) {
            return false;
          }


          if (
            c.high <
              c.low ||
            c.high <
              Math.max(
                c.open,
                c.close
              ) ||
            c.low >
              Math.min(
                c.open,
                c.close
              )
          ) {
            return false;
          }


          return true;
        }
      )
      .sort(
        (a, b) =>
          a._sortTime -
            b._sortTime ||
          a._index -
            b._index
      );


  /*
   * Duplicate timestamps:
   * keep the latest received candle.
   */
  const unique =
    new Map();

  for (
    const candle of normalized
  ) {

    unique.set(
      candle._sortTime,
      candle
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
      }) =>
        candle
    );
}


function setupStyleAnalysisToggle() {

  const head =
    $("styleToggleHead");

  const details =
    $("styleDetails");

  const icon =
    $("styleExpandIcon");

  if (
    !head ||
    !details ||
    !icon ||
    head.dataset.toggleReady === "true"
  ) {
    return;
  }

  head.dataset.toggleReady =
    "true";

  const toggle =
    () => {

      const card =
        head.closest(
          ".style-analysis-card"
        );

      const isOpen =
        !card.classList.contains(
          "style-expanded"
        );

      card.classList.toggle(
        "style-expanded",
        isOpen
      );

      details.classList.toggle(
        "style-details-collapsed",
        !isOpen
      );

      head.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

      icon.textContent =
        isOpen
          ? "▲"
          : "▼";
    };

  head.addEventListener(
    "click",
    toggle
  );

  head.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        toggle();
      }
    }
  );
}


function validStylePlanCandidateLevels(analysis, risk) {
  if (!analysis || !risk) return false;

  const fields = [
    "entryLow", "entryHigh", "entryReference",
    "stopLoss", "target1", "target2", "rr1", "rr2", "riskReward"
  ];
  const n = {};

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

    n[field] = Number(value);
  }

  const {
    entryLow: low,
    entryHigh: high,
    entryReference: entry,
    stopLoss: stop,
    target1: t1,
    target2: t2,
    rr1: reportedRR1,
    rr2: reportedRR2,
    riskReward: reportedRiskReward
  } = n;

  if (low > high || entry < low || entry > high) return false;

  const styleDirection = String(analysis.bias || "").trim().toUpperCase();
  const riskDirection = String(risk.directionalContext || "").trim().toUpperCase();

  // Require canonical Style and Risk directions.
  const styleBullish = styleDirection === "BULLISH";
  const styleBearish = styleDirection === "BEARISH";
  const riskBullish =
    /^(BULLISH|BULLISH\s+—\s+UNCONFIRMED)$/.test(riskDirection);
  const riskBearish =
    /^(BEARISH|BEARISH\s+—\s+UNCONFIRMED)$/.test(riskDirection);

  // Require one explicit Risk Engine direction matching Style.
  // A matching UNCONFIRMED direction is still allowed.
  if (
    riskBullish === riskBearish ||
    (styleBullish && !riskBullish) ||
    (styleBearish && !riskBearish)
  ) {
    return false;
  }

  const bullish = styleBullish;
  const bearish = styleBearish;

  if (bullish === bearish) return false;

  let riskDistance;
  let actualRR1;
  let actualRR2;

  if (bullish) {
    if (!(stop < low && t1 > high && t2 > t1)) return false;

    riskDistance = entry - stop;
    actualRR1 = (t1 - entry) / riskDistance;
    actualRR2 = (t2 - entry) / riskDistance;
  } else {
    if (!(stop > high && t1 < low && t2 < t1)) return false;

    riskDistance = stop - entry;
    actualRR1 = (entry - t1) / riskDistance;
    actualRR2 = (entry - t2) / riskDistance;
  }

  if (
    !Number.isFinite(riskDistance) ||
    riskDistance <= 0 ||
    !Number.isFinite(actualRR1) ||
    !Number.isFinite(actualRR2) ||
    actualRR1 < 1.5 - 1e-12
  ) {
    return false;
  }

  const tolerance = 0.03;

  return (
    Math.abs(reportedRR1 - actualRR1) <= tolerance &&
    Math.abs(reportedRR2 - actualRR2) <= tolerance &&
    Math.abs(reportedRiskReward - actualRR2) <= tolerance
  );
}


function renderStyleAnalysisPlain(
  analysis,
  symbol,
  risk
) {

  const state =
    $("styleState");

  const details =
    $("styleDetails");

  if (
    !state ||
    !details
  ) {
    return;
  }


  const plan =
    analysis.plan;


  /*
   * TRADE CONFIDENCE is NOT historical accuracy.
   * It uses the existing Risk Engine setupQuality.
   *
   * Only show a percentage when the final Risk Engine
   * has confirmed an actionable TRADE-CANDIDATE.
   */
  const levelsValid =
    validStylePlanCandidateLevels(analysis, risk);

  const tradeConfirmed =
    Boolean(
      plan &&
      plan.status === "TRADE-CANDIDATE" &&
      risk &&
      risk.decision === "TRADE-CANDIDATE" &&
      levelsValid
    );

  const confidence =
    tradeConfirmed &&
    Number.isFinite(
      risk.setupQuality
    )
      ? Math.round(
          risk.setupQuality
        )
      : null;

  const confidenceLevel =
    confidence === null
      ? "Abhi valid trade confirm nahi hua"
      : confidence >= 75
        ? "HIGH — Strong setup"
        : confidence >= 55
          ? "MEDIUM — Valid setup, risk control zaroori hai"
          : "LOW — Trade avoid karo";


  const displayStatus =
    tradeConfirmed
      ? "TRADE-CANDIDATE"
      : plan.status === "TRADE-CANDIDATE"
        ? !levelsValid
          ? "WAIT — LEVEL VALIDATION FAILED"
          : `WAIT — RISK ${risk?.decision || "NOT CONFIRMED"}`
        : plan.status;

  state.textContent =
    `${analysis.profile.label} • ${displayStatus}`;


  state.className =
    tradeConfirmed
      ? trendClass(
          analysis.bias
        )
      : "neutral";


  const price =
    value => {
      const numeric = Number(value);

      return (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== "" &&
        Number.isFinite(numeric) &&
        numeric > 0
      )
        ? formatPrice(
            numeric,
            symbol
          )
        : "--";
    };

  const ratio =
    value => {
      const numeric = Number(value);

      return (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== "" &&
        Number.isFinite(numeric) &&
        numeric > 0
      )
        ? "1 : " + numeric.toFixed(2)
        : "--";
    };


  let tradePlan =
    "ENTRY: --\n" +
    "STOP LOSS: --\n" +
    "TARGET 1: --\n" +
    "TARGET 2: --";


  if (
    plan.active &&
    tradeConfirmed
  ) {

    tradePlan =
      `ENTRY ZONE: ${price(
        risk.entryLow
      )} → ${price(
        risk.entryHigh
      )}\n` +

      `STOP LOSS: ${price(
        risk.stopLoss
      )}\n` +

      `TARGET 1: ${price(
        risk.target1
      )}\n` +

      `R:R T1: ${ratio(
        risk.rr1
      )}\n` +

      `TARGET 2: ${price(
        risk.target2
      )}\n` +

      `R:R T2: ${ratio(
        risk.rr2
      )}`;
  }


  details.textContent =
    `Style: ${analysis.profile.label}\n` +
    `Execution TF: ${analysis.profile.execution}\n` +
    `Context TF: ${analysis.profile.context}\n` +
    `Higher TF: ${analysis.profile.higher}\n\n` +

    `BIAS\n` +
    `${analysis.bias}\n\n` +

    `SETUP STATUS\n` +
    `${displayStatus}\n\n` +

    `TRADE CONFIDENCE\n` +
    `${
      confidence === null
        ? "--"
        : confidence + "%"
    }\n` +
    `${confidenceLevel}\n\n` +

    `WHY\n` +
    `${plan.reason}\n\n` +

    `NEXT CONDITION\n` +
    `${analysis.nextCondition}` +
    (
      plan.active && tradeConfirmed
        ? `\n\nTRADE PLAN\n${tradePlan}`
        : ""
    );
}


function renderMtf(
  mtf,
  counts
) {

  const title =
    $("mtfState");

  title.textContent =
    mtf.executionState;

  title.className =
    trendClass(
      mtf.executionState
    );

  function frameText(
    frame,
    count
  ) {

    return (
      `${frame.timeframe} • ${count} candles\n` +
      `Direction: ${frame.direction}\n` +
      `Structure: ${frame.structure}\n` +
      `Event: ${frame.structureEvent}\n` +
      `Momentum: ${frame.momentum}\n` +
      `SMC: ${frame.smcContext}\n` +
      `Quality: ${frame.quality}\n` +
      `Bull Evidence: ${frame.bullishEvidence}   Bear: ${frame.bearishEvidence}`
    );
  }

  $("mtfDetails")
    .textContent =
      mtf.evidence +
      "\n\n" +

      frameText(
        mtf.daily,
        counts.d1
      ) +
      "\n\n" +

      frameText(
        mtf.fourHour,
        counts.h4
      ) +
      "\n\n" +

      frameText(
        mtf.oneHour,
        counts.h1
      ) +
      "\n\n" +

      frameText(
        mtf.fifteenMinute,
        counts.m15
      );
}


function renderSmc(
  smc,
  symbol
) {

  const title =
    $("smcContext");

  title.textContent =
    smc.context;

  title.className =
    trendClass(
      smc.context
    );

  const fvgRange =
    Number.isNaN(
      smc.fvgLow
    ) ||
    Number.isNaN(
      smc.fvgHigh
    )
      ? "--"
      : (
          formatPrice(
            smc.fvgLow,
            symbol
          ) +
          " → " +
          formatPrice(
            smc.fvgHigh,
            symbol
          )
        );

  const obRange =
    Number.isNaN(
      smc.orderBlockLow
    ) ||
    Number.isNaN(
      smc.orderBlockHigh
    )
      ? "--"
      : (
          formatPrice(
            smc.orderBlockLow,
            symbol
          ) +
          " → " +
          formatPrice(
            smc.orderBlockHigh,
            symbol
          )
        );

  $("smcDetails")
    .textContent =
      smc.evidence +
      "\n\n" +

      "BUY-SIDE LIQUIDITY\n" +
      smc.equalHighLiquidity +
      "\nStatus: " +
      smc.equalHighStatus +
      "\nLevel: " +
      formatPrice(
        smc.equalHighLevel,
        symbol
      ) +
      "\n\n" +

      "SELL-SIDE LIQUIDITY\n" +
      smc.equalLowLiquidity +
      "\nStatus: " +
      smc.equalLowStatus +
      "\nLevel: " +
      formatPrice(
        smc.equalLowLevel,
        symbol
      ) +
      "\n\n" +

      "DISPLACEMENT\n" +
      smc.displacement +
      "\nQuality: " +
      smc.displacementQuality +
      (
        smc.displacement === "NO STRONG DISPLACEMENT"
          ? "\nHighest scanned body / previous average body: "
          : "\nConfirmed candle body / previous average body: "
      ) +
      smc.displacementRatio.toFixed(2) +
      "x\nRequired: body >= 1.50x previous 10-candle average AND body >= 60% of candle range." +
      (
        smc.displacement === "NO STRONG DISPLACEMENT"
          ? "\nNo scanned candle passed both conditions."
          : ""
      ) +
      "\n\n" +

      "FAIR VALUE GAP\n" +
      smc.fvg +
      "\nStatus: " +
      smc.fvgStatus +
      "\nRange: " +
      fvgRange +
      "\nMitigated: " +
      smc.fvgMitigationPercent.toFixed(1) +
      "%\n\n" +

      "ORDER BLOCK\n" +
      smc.orderBlock +
      "\nQuality: " +
      smc.orderBlockQuality +
      "\nRange: " +
      obRange +
      "\n\n" +

      "DEALING RANGE\n" +
      "Low: " +
      formatPrice(
        smc.dealingRangeLow,
        symbol
      ) +
      "\nHigh: " +
      formatPrice(
        smc.dealingRangeHigh,
        symbol
      ) +
      "\nEquilibrium: " +
      formatPrice(
        smc.equilibrium,
        symbol
      ) +
      "\nPosition: " +
      smc.premiumDiscount +
      "\n\n" +

      "Confluence Grade: " +
      smc.confluenceGrade +
      "\nBull Score: " +
      smc.bullishScore +
      "\nBear Score: " +
      smc.bearishScore;
}


/* === WHY THIS SIGNAL WAS CONFIRMED — live render === */

function isConfirmedWhySignalCandidate(analysis) {
  const risk = analysis && analysis.risk;
  const plan = analysis && analysis.style && analysis.style.plan;

  return Boolean(
    risk &&
    plan &&
    String(risk.decision || "").toUpperCase() === "TRADE-CANDIDATE" &&
    plan.status === "TRADE-CANDIDATE" &&
    validStylePlanCandidateLevels(analysis, risk)
  );
}


function renderWhySignal(analysis, frames, mode, symbol) {

  const card = document.getElementById("whySignalCard");
  const body = document.getElementById("whySignalBody");
  const heading = document.getElementById("whySignalHeading");
  if (!card || !body || !heading) return;

  // Dynamic title based on current analysis state.
  const riskDecision =
    (analysis && analysis.risk && analysis.risk.decision) || "WAIT";
  const isConfirmed = isConfirmedWhySignalCandidate(analysis);
  const titleEl =
    heading.querySelector("h2");
  if (titleEl) {
    titleEl.textContent =
      isConfirmed
        ? "WHY THIS SIGNAL WAS CONFIRMED"
        : "WHY THIS SIGNAL IS STILL WAITING";
  }

  // Build why object locally — same shape as watcher's buildSignalWhy
  let why = null;
  let candidateLevelsValid = false;
  try {
    const execCandles =
      mode === "swing"
        ? (frames && frames.h1)
        : (frames && frames.m15);

    if (!Array.isArray(execCandles) || execCandles.length < 20) {
      why = { version: 1, error: "insufficient_execution_candles" };
    } else {
      const structure = new MarketStructureEngine().analyze(execCandles);
      const priceAction = new PriceActionEngine().analyze(execCandles, structure);
      const smc = new SmcIctEngine().analyze(execCandles, structure);
      const mtf = analysis.mtf || {};
      const risk = analysis.risk || {};
      const style = analysis.style || {};
      candidateLevelsValid = isConfirmedWhySignalCandidate(analysis);
      const reasoning = analysis.reasoning || {};

      const r4 = v => {
        const n = Number(v);
        return Number.isFinite(n) ? Number(n.toFixed(4)) : null;
      };
      const sv = v =>
        (v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v)))
          ? null
          : v;
      const snap = f => ({
        structure: f && f.structure ? sv(f.structure) : null,
        direction: f && f.direction ? sv(f.direction) : null,
        quality: f && f.quality ? sv(f.quality) : null
      });

      why = {
        version: 1,
        marketStructure: {
          trend: sv(structure.trend),
          lastEvent: sv(structure.lastEvent),
          hh: sv(structure.higherHighs),
          hl: sv(structure.higherLows),
          lh: sv(structure.lowerHighs),
          ll: sv(structure.lowerLows),
          support: r4(structure.support),
          resistance: r4(structure.resistance),
          recentBullScore: sv(structure.bullishRecentScore),
          recentBearScore: sv(structure.bearishRecentScore)
        },
        smc: {
          orderBlock: sv(smc.orderBlock),
          orderBlockQuality: sv(smc.orderBlockQuality),
          orderBlockLow: r4(smc.orderBlockLow),
          orderBlockHigh: r4(smc.orderBlockHigh),
          fvg: sv(smc.fvg),
          fvgStatus: sv(smc.fvgStatus),
          fvgMitigationPercent: r4(smc.fvgMitigationPercent),
          fvgLow: r4(smc.fvgLow),
          fvgHigh: r4(smc.fvgHigh),
          liquiditySweep: sv(smc.liquiditySweep),
          displacement: sv(smc.displacement),
          displacementQuality: sv(smc.displacementQuality),
          displacementRatio: r4(smc.displacementRatio),
          premiumDiscount: sv(smc.premiumDiscount),
          confluenceGrade: sv(smc.confluenceGrade),
          context: sv(smc.context),
          bullishScore: sv(smc.bullishScore),
          bearishScore: sv(smc.bearishScore)
        },
        mtf: {
          daily: snap(mtf.daily),
          fourHour: snap(mtf.fourHour),
          oneHour: snap(mtf.oneHour),
          fifteenMinute: snap(mtf.fifteenMinute),
          higherTimeframeBias: sv(mtf.higherTimeframeBias),
          alignment: sv(mtf.alignment),
          lowerTimeframeState: sv(mtf.lowerTimeframeState),
          executionState: sv(mtf.executionState),
          confidence: sv(mtf.confidence),
          weightedBull: sv(mtf.bullishScore),
          weightedBear: sv(mtf.bearishScore)
        },
        priceAction: {
          candleDirection: sv(priceAction.candleDirection),
          candleStrength: sv(priceAction.candleStrength),
          rejection: sv(priceAction.rejection),
          breakout: sv(priceAction.breakout),
          momentum: sv(priceAction.momentum),
          bodyPercent: r4(priceAction.bodyPercent),
          upperWickPercent: r4(priceAction.upperWickPercent),
          lowerWickPercent: r4(priceAction.lowerWickPercent)
        },
        risk: {
          entryLow: r4(risk.entryLow),
          entryHigh: r4(risk.entryHigh),
          entryReference: r4(risk.entryReference),
          stopLoss: r4(risk.stopLoss),
          target1: r4(risk.target1),
          target2: r4(risk.target2),
          rr1: r4(risk.rr1),
          rr2: r4(risk.rr2),
          atr: r4(risk.atr),
          atrPercent: r4(risk.atrPercent),
          volatility: sv(risk.volatility),
          directionalContext: sv(risk.directionalContext),
          setupQuality: sv(risk.setupQuality),
          decision: sv(risk.decision),
          reason: sv(risk.reason)
        },
        finalCheck: {
          stylePlanStatus:
            (style.plan && style.plan.status) ||
            sv(style.decision),
          riskDecision: sv(risk.decision),
          candidateLevelValid: candidateLevelsValid,
          finalBias: sv(reasoning.finalBias),
          finalState: sv(reasoning.finalState),
          confidence: sv(reasoning.confidence),
          missingConfirmation: sv(reasoning.missingConfirmation)
        }
      };
    }
  } catch (e) {
    why = { version: 1, error: "engine_rerun_failed" };
  }

  if (!candidateLevelsValid && why && why.risk) {
    Object.assign(why.risk, {
      entryLow: null,
      entryHigh: null,
      entryReference: null,
      stopLoss: null,
      target1: null,
      target2: null,
      rr1: null,
      rr2: null
    });
  }

  try {
    renderWhySignalBody(body, why);
  } catch (renderErr) {
    console.error("[whySignal] render body failed:", renderErr);
    body.innerHTML =
      '<div class="why-signal-empty">' +
      "Detailed confirmation data could not be displayed for this signal." +
      "</div>";
  }
  card.classList.remove("hidden");
  heading.setAttribute("aria-expanded", "false");
  body.classList.add("why-signal-collapsed");

  // Toggle
  if (!heading.dataset.whyBound) {
    heading.dataset.whyBound = "1";
    heading.addEventListener("click", () => {
      const open = heading.getAttribute("aria-expanded") === "true";
      heading.setAttribute("aria-expanded", String(!open));
      body.classList.toggle("why-signal-collapsed", open);
    });
    heading.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        heading.click();
      }
    });
  }
}


function renderWhySignalBody(body, why) {

  const safe = v =>
    (v === undefined || v === null || v === "") ? "—" : String(v);

  if (!why || why.error) {
    body.innerHTML =
      '<div class="why-signal-empty">' +
      "Detailed confirmation data could not be recorded for this signal." +
      "</div>";
    return;
  }

  const row = (label, value, kind) => {
    const marker =
      kind === "gate" ? '<span class="why-marker why-marker-gate" title="Confirmation gate">●</span>' :
      kind === "info" ? '<span class="why-marker why-marker-info" title="Informational only">○</span>' :
      '<span class="why-marker why-marker-na" title="Not calculated">·</span>';
    return (
      '<div class="why-row">' +
        '<span class="why-row-label">' + label + '</span>' +
        '<span class="why-row-value">' + marker + ' ' + safe(value) + '</span>' +
      '</div>'
    );
  };

  const section = (title, rows) =>
    '<div class="why-section">' +
      '<div class="why-section-title">' + title + '</div>' +
      rows.join("") +
    '</div>';

  const ms = why.marketStructure || {};
  const smc = why.smc || {};
  const mtf = why.mtf || {};
  const pa = why.priceAction || {};
  const rk = why.risk || {};
  const fc = why.finalCheck || {};

  body.innerHTML =
    section("1. MARKET STRUCTURE", [
      row("Trend", ms.trend, "gate"),
      row("BOS / CHoCH", ms.lastEvent, "info"),
      row("HH / HL / LH / LL", [ms.hh, ms.hl, ms.lh, ms.ll].join(" / "), "info"),
      row("Support", ms.support, "info"),
      row("Resistance", ms.resistance, "info"),
      row("Recent Bull / Bear Score", [ms.recentBullScore, ms.recentBearScore].join(" / "), "info")
    ]) +
    section("2. SMC / ICT", [
      row("Order Block", smc.orderBlock, "info"),
      row("OB Quality", smc.orderBlockQuality, "info"),
      row("FVG", smc.fvg, "info"),
      row("FVG Status", smc.fvgStatus, "info"),
      row("FVG Mitigation %", smc.fvgMitigationPercent, "info"),
      row("Liquidity Sweep", smc.liquiditySweep, "info"),
      row("Displacement", smc.displacement, "info"),
      row("Premium / Discount", smc.premiumDiscount, "info"),
      row("Confluence Grade", smc.confluenceGrade, "gate"),
      row("Bull / Bear Score", [smc.bullishScore, smc.bearishScore].join(" / "), "info")
    ]) +
    section("3. MTF", [
      row("1D", (mtf.daily && mtf.daily.structure) || "—", "info"),
      row("4H", (mtf.fourHour && mtf.fourHour.structure) || "—", "info"),
      row("1H", (mtf.oneHour && mtf.oneHour.structure) || "—", "info"),
      row("15m", (mtf.fifteenMinute && mtf.fifteenMinute.structure) || "—", "info"),
      row("HTF Bias", mtf.higherTimeframeBias, "info"),
      row("Alignment", mtf.alignment, "info"),
      row("Execution State", mtf.executionState, "gate"),
      row("Confidence", mtf.confidence, "info"),
      row("Weighted Bull / Bear", [mtf.weightedBull, mtf.weightedBear].join(" / "), "info")
    ]) +
    section("4. PRICE ACTION", [
      row("Candle Direction", pa.candleDirection, "info"),
      row("Candle Strength", pa.candleStrength, "info"),
      row("Rejection", pa.rejection, "info"),
      row("Breakout", pa.breakout, "info"),
      row("Momentum", pa.momentum, "info"),
      row("Body %", pa.bodyPercent, "info"),
      row("Upper Wick %", pa.upperWickPercent, "info"),
      row("Lower Wick %", pa.lowerWickPercent, "info")
    ]) +
    section("5. RISK", [
      row("Entry Low", rk.entryLow, "info"),
      row("Entry High", rk.entryHigh, "info"),
      row("Entry Reference", rk.entryReference, "info"),
      row("Stop Loss", rk.stopLoss, "info"),
      row("Target 1", rk.target1, "info"),
      row("Target 2", rk.target2, "info"),
      row("RR1 / RR2", [rk.rr1, rk.rr2].join(" / "), "info"),
      row("ATR", rk.atr, "info"),
      row("ATR %", rk.atrPercent, "info"),
      row("Volatility", rk.volatility, "info"),
      row("Directional Context", rk.directionalContext, "gate"),
      row("Setup Quality", rk.setupQuality, "info"),
      row("Risk Decision", rk.decision, "gate"),
      row("Risk Reason", rk.reason, "info")
    ]) +
    section("6. FINAL CHECK", [
      row("Style Plan Status", fc.stylePlanStatus, "gate"),
      row("Risk Decision", fc.riskDecision, "gate"),
      row("Candidate Levels Valid", fc.candidateLevelValid ? "YES" : "NO", fc.candidateLevelValid ? "gate" : "info"),
      row("Final Bias", fc.finalBias, "info"),
      row("Final State", fc.finalState, "info"),
      row("Confidence", fc.confidence, "info"),
      row("Missing Confirmation", fc.missingConfirmation, "info")
    ]) +
    '<div class="why-signal-disclaimer">' +
    "This is an engine confluence evaluation, not a guaranteed win." +
    "</div>";
}


function renderRisk(
  risk,
  symbol
) {

  const title =
    $("riskState");

  title.textContent =
    risk.entryStatus;

  title.className =
    risk.decision ===
      "TRADE-CANDIDATE"
      ? trendClass(
          risk.directionalContext
        )
      : "neutral";

  const actionable =
    risk.decision ===
    "TRADE-CANDIDATE";

  const priceOrDash =
    value =>
      Number.isFinite(value)
        ? formatPrice(
            value,
            symbol
          )
        : "--";

  const rr =
    value =>
      Number.isFinite(value)
        ? "1 : " +
          value.toFixed(2)
        : "--";

  const hiddenPrice =
    value =>
      actionable
        ? priceOrDash(value)
        : "--";

  const hiddenRR =
    value =>
      actionable
        ? rr(value)
        : "--";

  const planMessage =
    actionable
      ? "ACTIVE TRADE PLAN"
      : (
          risk.decision === "SKIP"
            ? "NO TRADE — SETUP REJECTED"
            : "NO ACTIVE ENTRY — WAIT FOR CONFIRMATION"
        );

  $("riskDetails")
    .textContent =
      `Plan Status: ${planMessage}\n` +
      `Analysis State: ${risk.decision}\n` +
      `Reason: ${risk.reason}\n` +
      `Directional Context: ${risk.directionalContext}\n` +
      `Execution Basis: ${risk.executionTimeframe || "1H"}\n\n` +

      `ENTRY ZONE\n` +
      `${hiddenPrice(
        risk.entryLow
      )} → ${hiddenPrice(
        risk.entryHigh
      )}\n` +
      `Reference Price: ${priceOrDash(
        risk.entryReference
      )}\n\n` +

      `STOP LOSS\n` +
      `${hiddenPrice(
        risk.stopLoss
      )}\n\n` +

      `TARGET 1\n` +
      `${hiddenPrice(
        risk.target1
      )}\n` +
      `R:R to T1: ${hiddenRR(
        risk.rr1
      )}\n\n` +

      `TARGET 2\n` +
      `${hiddenPrice(
        risk.target2
      )}\n` +
      `R:R to T2: ${hiddenRR(
        risk.rr2
      )}\n\n` +

      (
        actionable
          ? `Target Logic: ${risk.targetLogic}\n\n`
          : "Target Logic: Not active until setup confirmation\n\n"
      ) +

      `ATR(14): ${priceOrDash(
        risk.atr
      )}\n` +
      `Volatility: ${risk.volatility}\n` +
      `Setup Quality: ${risk.setupQuality}/100 (${risk.quality})\n\n` +

      `EXIT CONDITION\n` +
      (
        actionable
          ? risk.exitCondition
          : "No active trade. Wait for structure and timeframe confirmation."
      );
}


function renderReasoning(
  reasoning
) {

  const title =
    $("reasoningState");

  title.textContent =
    `${reasoning.finalBias} • ${reasoning.finalState}`;

  title.className =
    reasoning.finalState ===
      "TRADE-CANDIDATE"
      ? trendClass(
          reasoning.finalBias
        )
      : "neutral";


  $("reasoningDetails")
    .textContent =
      `Confidence: ${reasoning.confidence}\n\n` +

      `MARKET THESIS\n` +
      `${reasoning.thesis}\n\n` +

      `SUPPORTING EVIDENCE\n` +
      `${reasoning.supportingEvidence}\n\n` +

      `CONFLICTING / CAUTION EVIDENCE\n` +
      `${reasoning.conflictingEvidence}\n\n` +

      `MISSING CONFIRMATION\n` +
      `${reasoning.missingConfirmation}\n\n` +

      `NEXT CONDITION\n` +
      `${reasoning.nextCondition}\n\n` +

      `INVALIDATION\n` +
      `${reasoning.invalidationNarrative}\n\n` +

      `RISK CONTEXT\n` +
      reasoning.riskNarrative;
}


function fundamentalContextDirection(
  data,
  isForex
) {

  if (
    !data ||
    !data.ok
  ) {
    return {
      direction:
        "UNAVAILABLE",

      label:
        "UNAVAILABLE"
    };
  }


  if (!isForex) {

    const state =
      String(
        data.context?.state ||
        "BALANCED / MIXED"
      )
        .trim()
        .toUpperCase();


    if (
      state.includes(
        "POSITIVE"
      )
    ) {
      return {
        direction:
          "BULLISH",

        label:
          state
      };
    }


    if (
      state.includes(
        "NEGATIVE"
      )
    ) {
      return {
        direction:
          "BEARISH",

        label:
          state
      };
    }


    return {
      direction:
        "NEUTRAL",

      label:
        state
    };
  }


  const tilt =
    String(
      data.macroComparison
        ?.relativeTilt ||
      "BALANCED / MIXED"
    )
      .trim()
      .toUpperCase();


  if (
    (
      tilt.includes(
        "BASE"
      ) &&
      tilt.includes(
        "FAVOR"
      )
    ) ||
    tilt.includes(
      "BULLISH"
    )
  ) {

    return {
      direction:
        "BULLISH",

      label:
        tilt
    };
  }


  if (
    (
      tilt.includes(
        "QUOTE"
      ) &&
      tilt.includes(
        "FAVOR"
      )
    ) ||
    tilt.includes(
      "BEARISH"
    )
  ) {

    return {
      direction:
        "BEARISH",

      label:
        tilt
    };
  }


  return {
    direction:
      "NEUTRAL",

    label:
      tilt
  };
}


function newsContextDirection(
  data
) {

  if (
    !data ||
    !data.ok
  ) {

    return {
      direction:
        "UNAVAILABLE",

      label:
        "UNAVAILABLE",

      risk:
        "UNAVAILABLE"
    };
  }


  const sentiment =
    String(
      data.summary
        ?.sentiment ||
      "MIXED / NEUTRAL"
    )
      .trim()
      .toUpperCase();


  let direction =
    "NEUTRAL";


  if (
    sentiment.includes(
      "BULLISH"
    )
  ) {
    direction =
      "BULLISH";
  }


  if (
    sentiment.includes(
      "BEARISH"
    )
  ) {
    direction =
      "BEARISH";
  }


  return {
    direction,

    label:
      sentiment,

    risk:
      String(
        data.summary
          ?.newsRisk ||
        "NONE"
      )
        .trim()
        .toUpperCase()
  };
}


function externalContextAlignment(
  technicalBias,
  contextDirection
) {

  const technical =
    String(
      technicalBias ||
      ""
    )
      .trim()
      .toUpperCase();

  const context =
    String(
      contextDirection ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    context === "UNAVAILABLE"
  ) {
    return "UNAVAILABLE";
  }


  if (
    context === "NEUTRAL"
  ) {
    return "MIXED / NEUTRAL";
  }


  let technicalDirection =
    "NEUTRAL";


  if (
    technical.includes(
      "BULLISH"
    )
  ) {
    technicalDirection =
      "BULLISH";

  } else if (
    technical.includes(
      "BEARISH"
    )
  ) {
    technicalDirection =
      "BEARISH";
  }


  if (
    technicalDirection ===
    "NEUTRAL"
  ) {
    return "NO DIRECTIONAL COMPARISON";
  }


  if (
    technicalDirection ===
    context
  ) {
    return "ALIGNED";
  }


  return "CONFLICTING";
}


function renderReasoningWithContext(
  reasoning,
  fundamentalData,
  newsData,
  isForex
) {

  renderReasoning(
    reasoning
  );


  const details =
    $("reasoningDetails");


  if (!details) {
    return;
  }


  const fundamental =
    fundamentalContextDirection(
      fundamentalData,
      isForex
    );


  const news =
    newsContextDirection(
      newsData
    );


  const fundamentalAlignment =
    externalContextAlignment(
      reasoning.finalBias,
      fundamental.direction
    );


  const newsAlignment =
    externalContextAlignment(
      reasoning.finalBias,
      news.direction
    );


  const contextLines = [
    "",
    "",
    "EXTERNAL CONTEXT",
    "Technical Bias: " +
      reasoning.finalBias,

    "",
    "Fundamental Context: " +
      fundamental.label,

    "Fundamental Alignment: " +
      fundamentalAlignment,

    "",
    "News Context: " +
      news.label,

    "News Alignment: " +
      newsAlignment,

    "News Risk: " +
      news.risk,

    "",
    "CONTEXT INTERPRETATION"
  ];


  if (
    fundamentalAlignment ===
      "NO DIRECTIONAL COMPARISON" ||
    newsAlignment ===
      "NO DIRECTIONAL COMPARISON"
  ) {

    contextLines.push(
      "Technical bias is neutral or conflicted, so directional external context is informational only until a technical direction is established."
    );

  } else if (
    fundamentalAlignment === "ALIGNED" &&
    newsAlignment === "ALIGNED"
  ) {

    contextLines.push(
      "Fundamental and news context both support the current technical bias."
    );

  } else if (
    fundamentalAlignment === "CONFLICTING" &&
    newsAlignment === "CONFLICTING"
  ) {

    contextLines.push(
      "Fundamental and news context both conflict with the current technical bias. Extra confirmation is important."
    );

  } else if (
    fundamentalAlignment === "MIXED / NEUTRAL" &&
    newsAlignment === "ALIGNED"
  ) {

    contextLines.push(
      "News context supports the current technical bias, while fundamental context remains neutral."
    );

  } else if (
    fundamentalAlignment === "ALIGNED" &&
    newsAlignment === "MIXED / NEUTRAL"
  ) {

    contextLines.push(
      "Fundamental context supports the current technical bias, while news context remains neutral."
    );

  } else if (
    fundamentalAlignment === "CONFLICTING" &&
    newsAlignment === "ALIGNED"
  ) {

    contextLines.push(
      "News context supports the technical bias, but fundamental context conflicts with it."
    );

  } else if (
    fundamentalAlignment === "ALIGNED" &&
    newsAlignment === "CONFLICTING"
  ) {

    contextLines.push(
      "Fundamental context supports the technical bias, but news context conflicts with it."
    );

  } else if (
    fundamentalAlignment === "CONFLICTING" ||
    newsAlignment === "CONFLICTING"
  ) {

    contextLines.push(
      "External context is mixed because one evidence layer conflicts with the current technical bias."
    );

  } else {

    contextLines.push(
      "External context is neutral or incomplete relative to the current technical bias."
    );
  }


  if (
    news.risk ===
    "HIGH"
  ) {

    contextLines.push(
      "High news risk is present, so volatility and headline-driven moves can increase."
    );
  }


  contextLines.push(
    "",
    "DECISION RULE",
    "Fundamental and news context do not override the technical WAIT / TRADE-CANDIDATE decision."
  );


  details.textContent +=
    contextLines.join(
      "\n"
    );
}


let fundamentalRequestGeneration =
  0;


let newsRequestGeneration =
  0;


function fundamentalNumber(
  value,
  digits = 2
) {

  return (
    typeof value === "number" &&
    Number.isFinite(
      value
    )
  )
    ? value.toFixed(
        digits
      )
    : "--";
}


function setFundamentalText(
  element,
  english
) {

  if (!element) {
    return;
  }


  element.dataset.englishSource =
    english;


  const language =
    $("languageMode")
      ? $("languageMode").value
      : "hinglish";


  element.textContent =
    language === "hinglish"
      ? translateToHinglish(
          english
        )
      : english;
}


function macroLinesForCurrency(
  currency,
  snapshot
) {

  if (
    !snapshot ||
    snapshot.error
  ) {

    return [
      currency +
      " MACRO",
      "Public macro dataset: Not connected yet"
    ];
  }


  if (
    currency === "EUR"
  ) {

    return [
      "EUR MACRO",
      "Inflation: " +
        fundamentalNumber(
          snapshot.inflation
            ?.ratePercent
        ) +
        "% (" +
        (
          snapshot.inflation
            ?.trend ||
          "UNKNOWN"
        ) +
        ")",

      "Unemployment: " +
        fundamentalNumber(
          snapshot.unemployment
            ?.ratePercent
        ) +
        "% (" +
        (
          snapshot.unemployment
            ?.trend ||
          "UNKNOWN"
        ) +
        ")",

      "GDP QoQ: " +
        fundamentalNumber(
          snapshot.gdp
            ?.qoqPercent
        ) +
        "% (" +
        (
          snapshot.gdp
            ?.trend ||
          "UNKNOWN"
        ) +
        ")"
    ];
  }


  if (
    currency === "USD"
  ) {

    return [
      "USD MACRO",
      "CPI YoY: " +
        fundamentalNumber(
          snapshot.cpi
            ?.yoyPercent
        ) +
        "% (" +
        (
          snapshot.cpi
            ?.trend ||
          "UNKNOWN"
        ) +
        ")",

      "Unemployment: " +
        fundamentalNumber(
          snapshot.unemployment
            ?.ratePercent
        ) +
        "% (" +
        (
          snapshot.unemployment
            ?.trend ||
          "UNKNOWN"
        ) +
        ")",

      "Payroll change: " +
        fundamentalNumber(
          snapshot.payroll
            ?.changeThousands,
          0
        ) +
        " thousand (" +
        (
          snapshot.payroll
            ?.trend ||
          "UNKNOWN"
        ) +
        ")"
    ];
  }


  if (
    currency === "JPY"
  ) {

    return [
      "JPY MACRO",

      "CPI YoY: " +
        fundamentalNumber(
          snapshot.cpi
            ?.yoyPercent
        ) +
        "% (" +
        (
          snapshot.cpi
            ?.trend ||
          "UNKNOWN"
        ) +
        ")",

      "Unemployment: " +
        fundamentalNumber(
          snapshot.unemployment
            ?.ratePercent
        ) +
        "% (" +
        (
          snapshot.unemployment
            ?.trend ||
          "UNKNOWN"
        ) +
        ")",

      "GDP QoQ: " +
        fundamentalNumber(
          snapshot.gdp
            ?.qoqPercent
        ) +
        "% (" +
        (
          snapshot.gdp
            ?.trend ||
          "UNKNOWN"
        ) +
        ")"
    ];
  }


  return [
    currency +
      " MACRO",
    "Public macro dataset: Not connected yet"
  ];
}


function policyLinesForCurrency(
  currency,
  rates
) {

  if (
    !rates ||
    rates.error
  ) {

    return [
      currency +
      " Policy Rate: --"
    ];
  }


  if (
    currency === "USD"
  ) {

    return [
      "Federal Reserve target: " +
        fundamentalNumber(
          rates.lowerPercent,
          3
        ) +
        "% - " +
        fundamentalNumber(
          rates.upperPercent,
          3
        ) +
        "%",

      "Fed midpoint: " +
        fundamentalNumber(
          rates.midpointPercent,
          3
        ) +
        "%",

      "Fed direction: " +
        (
          rates.direction ||
          "UNKNOWN"
        )
    ];
  }


  if (
    currency === "EUR"
  ) {

    return [
      "ECB deposit rate: " +
        fundamentalNumber(
          rates.ratePercent,
          3
        ) +
        "%",

      "ECB previous rate: " +
        fundamentalNumber(
          rates.previousRatePercent,
          3
        ) +
        "%",

      "ECB direction: " +
        (
          rates.direction ||
          "UNKNOWN"
        )
    ];
  }


  if (
    currency === "JPY"
  ) {

    return [
      "BOJ overnight call rate (actual avg): " +
        fundamentalNumber(
          rates.ratePercent,
          3
        ) +
        "%",

      "Previous observation: " +
        fundamentalNumber(
          rates.previousRatePercent,
          3
        ) +
        "%",

      "Observation date: " +
        (
          rates.date ||
          "--"
        )
    ];
  }


  return [
    currency +
      " Policy Rate: --"
  ];
}


function fundamentalValueAvailable(
  value
) {

  return (
    value !== null &&
    value !== undefined &&
    value !== ""
  );
}


function fundamentalCompactUsd(
  value
) {

  if (
    !fundamentalValueAvailable(
      value
    )
  ) {
    return "--";
  }

  const n =
    Number(
      value
    );


  if (
    !Number.isFinite(
      n
    )
  ) {
    return "--";
  }


  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2
    }
  ).format(
    n
  );
}


function fundamentalUsd(
  value
) {

  if (
    !fundamentalValueAvailable(
      value
    )
  ) {
    return "--";
  }

  const n =
    Number(
      value
    );


  if (
    !Number.isFinite(
      n
    )
  ) {
    return "--";
  }


  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits:
        n >= 100
          ? 2
          : 6
    }
  ).format(
    n
  );
}


function fundamentalSignedPercent(
  value
) {

  if (
    !fundamentalValueAvailable(
      value
    )
  ) {
    return "--";
  }

  const n =
    Number(
      value
    );


  if (
    !Number.isFinite(
      n
    )
  ) {
    return "--";
  }


  return (
    (
      n > 0
        ? "+"
        : ""
    ) +
    n.toFixed(
      2
    ) +
    "%"
  );
}


function fundamentalCompactNumber(
  value
) {

  if (
    !fundamentalValueAvailable(
      value
    )
  ) {
    return "--";
  }

  const n =
    Number(
      value
    );


  if (
    !Number.isFinite(
      n
    )
  ) {
    return "--";
  }


  return new Intl.NumberFormat(
    "en-US",
    {
      notation: "compact",
      maximumFractionDigits: 2
    }
  ).format(
    n
  );
}


function renderFundamentalReady(
  symbol,
  marketType
) {

  const isForex =
    marketType === "forex";

  const isStock =
    marketType === "stocks";

  const card =
    $("fundamentalCard");

  const state =
    $("fundamentalState");

  const details =
    $("fundamentalDetails");


  if (
    !card ||
    !state ||
    !details
  ) {
    return;
  }


  card.classList.remove(
    "hidden"
  );


  state.className =
    "neutral";


  setFundamentalText(
    state,
    "Ready for Fundamental Analysis"
  );


  setFundamentalText(
    details,
    isForex
      ? (
          "Tap Market Analyze Karo to load macro, policy-rate and economic-event data for " +
          symbol +
          "."
        )
      : isStock
        ? (
            "Tap Market Analyze Karo to load company profile, sector and key fundamental ratios for " +
            symbol +
            "."
          )
        : (
            "Tap Market Analyze Karo to load crypto market-cap, liquidity, supply, performance and global-market data for " +
            symbol +
            "."
          )
  );
}


function renderFundamentalAnalysis(
  data,
  symbol,
  marketType
) {

  const isForex =
    marketType === "forex";

  const isStock =
    marketType === "stocks";

  const card =
    $("fundamentalCard");

  const state =
    $("fundamentalState");

  const details =
    $("fundamentalDetails");


  if (
    !card ||
    !state ||
    !details
  ) {
    return;
  }


  card.classList.remove(
    "hidden"
  );


  if (!data) {

    state.className =
      "neutral";


    setFundamentalText(
      state,
      "Loading Fundamental Data"
    );


    setFundamentalText(
      details,
      isForex
        ? "Loading public macro, central-bank rate and economic-event data."
        : isStock
          ? "Loading Indian company profile, sector and key fundamental ratios from Upstox."
          : "Loading crypto asset and global-market fundamental data."
    );

    return;
  }


  if (
    !data.ok
  ) {

    state.className =
      "neutral";


    setFundamentalText(
      state,
      "Fundamental Data Unavailable"
    );


    setFundamentalText(
      details,
      (
        data.error ||
        "Fundamental data could not be loaded."
      ) +
      " Technical analysis remains available independently."
    );

    return;
  }


  /* =======================================
     INDIAN STOCK FUNDAMENTALS
     ======================================= */

  if (isStock) {

    const company =
      data.company ||
      {};

    const ratios =
      Array.isArray(
        data.ratios
      )
        ? data.ratios
        : [];

    state.className =
      "neutral";

    setFundamentalText(
      state,
      "COMPANY FUNDAMENTALS"
    );

    const lines = [
      "STOCK: " +
        symbol,

      "EXCHANGE: " +
        (
          data.exchange ||
          "--"
        ),

      "MARKET: Indian Equity",

      "",

      "COMPANY",

      "Name: " +
        (
          company.name ||
          symbol
        ),

      "Sector: " +
        (
          company.sector ||
          "--"
        ),

      "Sector Market Cap (INR): " +
        (
          company.sectorMarketCapInr
            ?.formatted ||
          "--"
        ),

      "Sector Market Cap (USD): " +
        (
          company.sectorMarketCapUsd
            ?.formatted ||
          "--"
        ),

      "",

      "KEY RATIOS",

      ...(
        ratios.length
          ? ratios.map(
              ratio =>
                (
                  ratio.name ||
                  "Ratio"
                ) +
                ": " +
                (
                  ratio.companyValue ??
                  "--"
                ) +
                " • Sector: " +
                (
                  ratio.sectorValue ??
                  "--"
                )
            )
          : [
              "No key ratios available"
            ]
      ),

      "",

      "COMPANY PROFILE",

      company.profile ||
        "Company profile unavailable.",

      "",

      "DATA SOURCE",

      data.provider ||
        "UPSTOX",

      "",

      "NOTE",

      data.note ||
        "Company fundamentals are context only and do not automatically override technical analysis."
    ];

    setFundamentalText(
      details,
      lines.join(
        "\n"
      )
    );

    return;
  }


  /* =======================================
     CRYPTO FUNDAMENTALS
     ======================================= */

  if (!isForex) {

    const asset =
      data.asset ||
      {};


    const global =
      data.global ||
      {};


    const derived =
      data.derived ||
      {};


    const context =
      data.context ||
      {};


    const tilt =
      context.state ||
      "BALANCED / MIXED";


    if (
      tilt.includes(
        "POSITIVE"
      )
    ) {

      state.className =
        "bullish";

    } else if (
      tilt.includes(
        "NEGATIVE"
      )
    ) {

      state.className =
        "bearish";

    } else {

      state.className =
        "neutral";
    }


    setFundamentalText(
      state,
      tilt
    );


    const evidence =
      Array.isArray(
        context.evidence
      )
        ? context.evidence
        : [];


    const lines = [
      "PAIR: " +
        symbol,

      "MARKET: Crypto",

      "",

      "CRYPTO FUNDAMENTAL CONTEXT",

      "State: " +
        tilt,

      "Context Score: " +
        (
          context.score ??
          "--"
        ),

      "",

      "ASSET MARKET DATA",

      "Asset: " +
        (
          asset.name ||
          data.base ||
          "--"
        ) +
        " (" +
        (
          asset.symbol ||
          data.base ||
          "--"
        ) +
        ")",

      "Market Cap Rank: " +
        (
          asset.marketCapRank
            ? "#" +
              asset.marketCapRank
            : "--"
        ),

      "Price: " +
        fundamentalUsd(
          asset.priceUsd
        ),

      "Market Cap: " +
        fundamentalCompactUsd(
          asset.marketCapUsd
        ),

      "24H Volume: " +
        fundamentalCompactUsd(
          asset.volume24hUsd
        ),

      "Volume / Market Cap: " +
        fundamentalNumber(
          derived.volumeToMarketCapPercent
        ) +
        "%",

      "",

      "PRICE PERFORMANCE",

      "24H: " +
        fundamentalSignedPercent(
          asset.change24h
        ),

      "7D: " +
        fundamentalSignedPercent(
          asset.change7d
        ),

      "30D: " +
        fundamentalSignedPercent(
          asset.change30d
        ),

      "ATH: " +
        fundamentalUsd(
          asset.athUsd
        ),

      "Distance from ATH: " +
        fundamentalSignedPercent(
          asset.athChangePercent
        ),

      "",

      "SUPPLY",

      "Circulating Supply: " +
        fundamentalCompactNumber(
          asset.circulatingSupply
        ),

      "Total Supply: " +
        fundamentalCompactNumber(
          asset.totalSupply
        ),

      "Max Supply: " +
        fundamentalCompactNumber(
          asset.maxSupply
        ),

      "Circulating / Total: " +
        fundamentalNumber(
          derived.circulatingPercent
        ) +
        "%",

      "",

      "GLOBAL CRYPTO MARKET",

      "Total Market Cap: " +
        fundamentalCompactUsd(
          global.totalMarketCapUsd
        ),

      "24H Market Volume: " +
        fundamentalCompactUsd(
          global.totalVolume24hUsd
        ),

      "Global Market 24H: " +
        fundamentalSignedPercent(
          global.marketCapChange24h
        ),

      "BTC Dominance: " +
        fundamentalNumber(
          global.btcDominance
        ) +
        "%",

      "ETH Dominance: " +
        fundamentalNumber(
          global.ethDominance
        ) +
        "%",

      "Active Cryptocurrencies: " +
        fundamentalCompactNumber(
          global.activeCryptocurrencies
        ),

      "",

      "FUNDAMENTAL EVIDENCE",

      ...(
        evidence.length
          ? evidence.map(
              item =>
                "• " +
                item
            )
          : [
              "• No strong fundamental tilt detected"
            ]
      ),

      "",

      "DATA SOURCES",

      "Asset: " +
        (
          data.providers
            ?.asset ||
          asset.source ||
          "--"
        ) +
        (
          asset.sourceState
            ? " • " +
              asset.sourceState
            : ""
        ),

      "Global Market: " +
        (
          data.providers
            ?.global ||
          global.source ||
          "--"
        ) +
        (
          global.sourceState
            ? " • " +
              global.sourceState
            : ""
        ),

      "",

      "NOTE",

      "Crypto fundamental data is market context only. It does not automatically create or override a technical trade signal."
    ];


    setFundamentalText(
      details,
      lines.join(
        "\n"
      )
    );

    return;
  }


  /* =======================================
     FOREX FUNDAMENTALS
     ======================================= */

  const base =
    data.base?.currency ||
    symbol.split("/")[0] ||
    "--";


  const quote =
    data.quote?.currency ||
    symbol.split("/")[1] ||
    "--";


  const macroMap = {
    EUR:
      data.macro?.eur,

    USD:
      data.macro?.usd,

    JPY:
      base === "JPY"
        ? data.macroComparison
            ?.baseSnapshot
        : quote === "JPY"
          ? data.macroComparison
              ?.quoteSnapshot
          : null
  };


  const rateMap = {
    EUR:
      data.policyRates?.eur,

    USD:
      data.policyRates?.usd,

    JPY:
      base === "JPY"
        ? data.policyRateComparison
            ?.baseRateDetail
        : quote === "JPY"
          ? data.policyRateComparison
              ?.quoteRateDetail
          : null
  };


  const comparison =
    data.macroComparison ||
    {};


  const policyComparison =
    data.policyRateComparison ||
    {};


  const tilt =
    comparison.relativeTilt ||
    "INCOMPLETE";


  state.className =
    "neutral";


  setFundamentalText(
    state,
    tilt
  );


  const lines = [
    "PAIR: " +
      symbol,

    "MARKET: Forex",

    "",

    "MACRO CONTEXT",

    "State: " +
      (
        comparison.state ||
        "INCOMPLETE"
      ),

    "Relative Tilt: " +
      tilt,

    "Base Macro Score: " +
      (
        comparison.base
          ?.score ??
        "--"
      ),

    "Quote Macro Score: " +
      (
        comparison.quote
          ?.score ??
        "--"
      ),

    "",

    ...macroLinesForCurrency(
      base,
      macroMap[
        base
      ]
    ),

    "",

    ...macroLinesForCurrency(
      quote,
      macroMap[
        quote
      ]
    ),

    "",

    "CENTRAL BANK POLICY",

    ...policyLinesForCurrency(
      base,
      rateMap[
        base
      ]
    ),

    "",

    ...policyLinesForCurrency(
      quote,
      rateMap[
        quote
      ]
    ),

    "",

    "RATE DIFFERENTIAL",

    "Base rate: " +
      fundamentalNumber(
        policyComparison
          .baseRatePercent,
        3
      ) +
      "%",

    "Quote rate: " +
      fundamentalNumber(
        policyComparison
          .quoteRatePercent,
        3
      ) +
      "%",

    "Difference: " +
      fundamentalNumber(
        policyComparison
          .differentialPercentagePoints,
        3
      ) +
      " percentage points",

    "Rate Context: " +
      (
        policyComparison
          .rateAdvantage ||
        "INCOMPLETE"
      ),

    "",

    "ECONOMIC EVENT RISK",

    data.calendarConfigured
      ? (
          "Event Risk: " +
          (
            data.summary
              ?.eventRisk ||
            "NONE"
          )
        )
      : "Event Risk: UNAVAILABLE — economic calendar source not connected yet",

    "",

    "DATA SOURCES",

    "Macro: " +
      [
        data.providers
          ?.usMacro,

        data.providers
          ?.euroAreaMacro,

        (
          base === "JPY" ||
          quote === "JPY"
        )
          ? "OECD PUBLIC API"
          : null
      ]
        .filter(
          value =>
            value &&
            value !==
              "NOT APPLICABLE"
        )
        .join(
          " • "
        ),

    "Policy Rates: " +
      [
        data.providers
          ?.fedPolicyRate,

        data.providers
          ?.ecbPolicyRate,

        (
          base === "JPY" ||
          quote === "JPY"
        )
          ? "BOJ TIME-SERIES API"
          : null
      ]
        .filter(
          value =>
            value &&
            value !==
              "NOT APPLICABLE"
        )
        .join(
          " • "
        ),

    "",

    "NOTE",

    "Fundamental data is macro context only. It does not automatically create or override a technical trade signal."
  ];


  setFundamentalText(
    details,
    lines.join(
      "\n"
    )
  );
}


async function fetchFundamentalAnalysis(
  symbol,
  marketType,
  exchange = ""
) {

  const isForex =
    marketType === "forex";

  const isStock =
    marketType === "stocks";

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      18000
    );


  try {

    const endpoint =
      isForex
        ? "/api/fundamentals"
        : isStock
          ? "/api/stock-fundamentals"
          : "/api/crypto-fundamentals";


    const params =
      new URLSearchParams({
        symbol
      });


    if (
      isForex
    ) {
      params.set(
        "days",
        "7"
      );
    }

    if (
      isStock &&
      exchange
    ) {
      params.set(
        "exchange",
        exchange
      );
    }


    const response =
      await fetch(
        endpoint +
          "?" +
          params.toString(),
        {
          signal:
            controller.signal
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.ok
    ) {

      return {
        ok: false,

        error:
          data.error ||
          "Fundamental analysis request failed"
      };
    }


    return data;

  } catch (
    error
  ) {

    return {
      ok: false,

      error:
        error?.name ===
          "AbortError"
          ? "Fundamental data request timed out"
          : (
              error?.message ||
              "Fundamental data could not be loaded"
            )
    };

  } finally {

    clearTimeout(
      timeout
    );
  }
}


function renderNewsSentimentPlaceholder(
  symbol,
  marketType,
  mode = "ready"
) {

  const state =
    $("newsSentimentState");

  const details =
    $("newsSentimentDetails");


  if (
    !state ||
    !details
  ) {
    return;
  }


  state.className =
    "neutral";


  const marketLabel =
    marketType === "forex"
      ? "Forex"
      : "Crypto";


  if (
    mode === "analyzing"
  ) {

    setFundamentalText(
      state,
      "Loading News…"
    );


    setFundamentalText(
      details,
      "PAIR: " +
        symbol +
        "\n" +
        "MARKET: " +
        marketLabel +
        "\n\n" +
        (
          marketType === "forex"
            ? "Loading live Fed / ECB news…"
            : "Loading live CoinDesk / Cointelegraph crypto news…"
        )
    );

    return;
  }


  setFundamentalText(
    state,
    "Ready for News Analysis"
  );


  setFundamentalText(
    details,
    "News / Sentiment Brain is ready for " +
      symbol +
      ". Tap Market Analyze Karo to load live " +
      (
        marketType === "forex"
          ? "Fed / ECB"
          : "CoinDesk / Cointelegraph"
      ) +
      " news."
  );
}


function formatNewsTime(
  value
) {

  const time =
    Date.parse(
      value
    );


  if (
    !Number.isFinite(
      time
    )
  ) {
    return "--";
  }


  try {

    return new Date(
      time
    ).toLocaleString(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  } catch {

    return value;
  }
}


function renderNewsSentimentAnalysis(
  data,
  symbol,
  marketType
) {

  const state =
    $("newsSentimentState");

  const details =
    $("newsSentimentDetails");


  if (
    !state ||
    !details
  ) {
    return;
  }


  if (
    !data ||
    !data.ok
  ) {

    state.className =
      "neutral";


    setFundamentalText(
      state,
      "News Unavailable"
    );


    setFundamentalText(
      details,
      (
        marketType === "stocks"
          ? "STOCK: "
          : "PAIR: "
      ) +
        symbol +
        "\n\n" +
        (
          data?.error ||
          (
            marketType === "stocks"
              ? "Indian stock news data could not be loaded."
              : marketType === "crypto"
                ? "Crypto news data could not be loaded."
                : "Forex news data could not be loaded."
          )
        ) +
        "\n\nTechnical analysis remains available independently."
    );

    return;
  }


  const summary =
    data.summary ||
    {};


  const sentiment =
    String(
      summary.sentiment ||
      "MIXED / NEUTRAL"
    );


  const risk =
    String(
      summary.newsRisk ||
      "NONE"
    );


  if (
    sentiment.includes(
      "BULLISH"
    )
  ) {

    state.className =
      "bullish";

  } else if (
    sentiment.includes(
      "BEARISH"
    )
  ) {

    state.className =
      "bearish";

  } else {

    state.className =
      "neutral";
  }


  setFundamentalText(
    state,
    sentiment
  );


  const lines = [];


  lines.push(
    (
      marketType === "stocks"
        ? "STOCK: "
        : "PAIR: "
    ) +
      symbol
  );


  lines.push(
    "MARKET: " +
      (
        marketType === "forex"
          ? "Forex"
          : marketType === "stocks"
            ? "Indian Equity"
            : "Crypto"
      )
  );


  lines.push(
    ""
  );


  lines.push(
    "NEWS SENTIMENT"
  );


  lines.push(
    "State: " +
      sentiment
  );


  lines.push(
    (
      marketType === "stocks"
        ? "Sentiment Score: "
        : "Pair Score: "
    ) +
      (
        Number.isFinite(
          Number(
            summary.pairScore
          )
        )
          ? Number(
              summary.pairScore
            ).toFixed(
              2
            )
          : "--"
      )
  );


  lines.push(
    "News Risk: " +
      risk
  );


  lines.push(
    "Recent Articles: " +
      (
        summary.total ??
        0
      )
  );


  lines.push(
    "High Impact: " +
      (
        summary.highImpact ??
        0
      )
  );


  lines.push(
    "Medium Impact: " +
      (
        summary.mediumImpact ??
        0
      )
  );


  const providers =
    Array.isArray(
      data.providers
    )
      ? data.providers
      : [];


  if (
    providers.length
  ) {

    lines.push(
      ""
    );


    lines.push(
      "NEWS SOURCES"
    );


    for (
      const provider of providers
    ) {

      lines.push(
        (
          provider.currency
            ? provider.currency +
              ": "
            : ""
        ) +
          (
            provider.source ||
            provider.sourceName ||
            "--"
          ) +
          " • " +
          (
            provider.status ||
            "--"
          ) +
          (
            provider.sourceState
              ? " • " +
                provider.sourceState
              : ""
          )
      );
    }
  }


  const items =
    Array.isArray(
      data.items
    )
      ? data.items
      : [];


  if (
    items.length
  ) {

    lines.push(
      ""
    );


    lines.push(
      "LATEST RELEVANT NEWS"
    );


    items
      .slice(
        0,
        8
      )
      .forEach(
        (
          item,
          index
        ) => {

          lines.push(
            ""
          );


          lines.push(
            (
              index + 1
            ) +
              ". [" +
              (
                item.impact ||
                "LOW"
              ) +
              "] " +
              (
                item.title ||
                "Untitled"
              )
          );


          lines.push(
            (
              item.currency ||
              "--"
            ) +
              " • " +
              (
                item.source ||
                "--"
              ) +
              " • " +
              formatNewsTime(
                item.publishedAt
              )
          );


          lines.push(
            "Tone: " +
              (
                item.tone ||
                "NEUTRAL / UNRESOLVED"
              )
          );


          if (
            item.relevance
          ) {

            lines.push(
              "Relevance: " +
                item.relevance
            );
          }
        }
      );

  } else {

    lines.push(
      ""
    );


    lines.push(
      "LATEST RELEVANT NEWS"
    );


    lines.push(
      marketType === "stocks"
        ? "No matching recent stock-news items were found in the selected news window."
        : marketType === "crypto"
          ? "No matching recent crypto-news items were found in the selected news window."
          : "No matching recent Fed / ECB items were found in the selected news window."
    );
  }


  lines.push(
    ""
  );


  lines.push(
    "NOTE"
  );


  lines.push(
    "News risk, impact and tone are engine classifications. News remains a separate evidence layer and does not automatically override technical analysis."
  );


  setFundamentalText(
    details,
    lines.join(
      "\n"
    )
  );
}


async function fetchNewsSentimentAnalysis(
  symbol,
  marketType,
  exchange = ""
) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      15000
    );


  try {

    const params =
      new URLSearchParams({
        symbol,
        days: "7",
        marketType
      });


    if (
      marketType === "stocks" &&
      exchange
    ) {
      params.set(
        "exchange",
        exchange
      );
    }


    const response =
      await fetch(
        "/api/news?" +
          params.toString(),
        {
          signal:
            controller.signal
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.ok
    ) {

      return {
        ok: false,

        error:
          data.error ||
          "News analysis request failed"
      };
    }


    return data;

  } catch (
    error
  ) {

    return {
      ok: false,

      error:
        error?.name ===
          "AbortError"
          ? "News request timed out"
          : (
              error?.message ||
              "News data could not be loaded"
            )
    };

  } finally {

    clearTimeout(
      timeout
    );
  }
}


function resetAnalysisOutput(
  symbol,
  exchange,
  interval,
  state,
  message
) {

  $("marketHeader")
    .textContent =
      symbol +
      (
        exchange
          ? " • " +
            exchange
          : ""
      );


  $("dataSource")
    .textContent =
      "--";

  $("lastPrice")
    .textContent =
      "--";

  $("candleCount")
    .textContent =
      "--";

  $("timeframe")
    .textContent =
      String(
        interval || ""
      )
        .toUpperCase();


  const stateIds = [
    "styleState",
    "structureTrend",
    "momentumState",
    "smcContext",
    "mtfState",
    "fundamentalState",
    "newsSentimentState",
    "riskState",
    "reasoningState"
  ];


  stateIds.forEach(
    id => {

      const element =
        $(id);

      if (element) {
        element.textContent =
          "--";
      }
    }
  );


  const detailIds = [
    "styleDetails",
    "structureDetails",
    "priceActionDetails",
    "smcDetails",
    "mtfDetails",
    "fundamentalDetails",
    "newsSentimentDetails",
    "riskDetails",
    "reasoningDetails"
  ];


  detailIds.forEach(
    id => {

      const element =
        $(id);

      if (element) {
        element.textContent =
          "";
      }
    }
  );


  $("analysisState")
    .textContent =
      state;

  $("analysisMessage")
    .textContent =
      message;


  const chart =
    $("priceChart");

  if (chart) {

    chart.innerHTML =
      "";

    chart.textContent =
      state ===
        "Analysis Error"
        ? "No chart data for this request."
        : "Loading market data…";
  }
}


async function analyze() {

  const symbol =
    $("symbol")
      .value
      .trim();

  const exchange =
    $("exchange")
      .value
      .trim();

  const interval =
    $("interval")
      .value;

  if (!symbol) {
    return;
  }

  analyzeButton.disabled =
    true;

  analyzeButton.textContent =
    "Analyzing…";

  resetAnalysisOutput(
    symbol,
    exchange,
    interval,
    "Fetching Market Data",
    "Loading real market candles and running analysis engines."
  );


  const isForexMarket =
    pairPickerState.type ===
      "forex";


  const fundamentalGeneration =
    ++fundamentalRequestGeneration;


  const newsGeneration =
    ++newsRequestGeneration;


  renderFundamentalAnalysis(
    null,
    symbol,
    pairPickerState.type
  );


  renderNewsSentimentPlaceholder(
    symbol,
    pairPickerState.type,
    "analyzing"
  );


  const fundamentalPromise =
    fetchFundamentalAnalysis(
      symbol,
      pairPickerState.type,
      exchange
    );


  const newsPromise =
    fetchNewsSentimentAnalysis(
      symbol,
      pairPickerState.type,
      exchange
    );


  try {

    const params =
      new URLSearchParams({
        symbol
      });

    if (exchange) {

      params.set(
        "exchange",
        exchange
      );
    }

    const response =
      await fetch(
        "/api/mtf?" +
        params.toString()
      );

    const data =
      await response.json();

    if (!data.ok) {

      throw new Error(
        data.error ||
        "Multi-timeframe market data failed"
      );
    }

    const m15 =
      normalizeCandles(
        data.frames.m15
          .candles
      );

    const h1 =
      normalizeCandles(
        data.frames.h1
          .candles
      );

    const h4 =
      normalizeCandles(
        data.frames.h4
          .candles
      );

    const d1 =
      normalizeCandles(
        data.frames.d1
          .candles
      );

    const selected =
      interval === "15min"
        ? data.frames.m15
        : interval === "4h"
          ? data.frames.h4
          : interval === "1day"
            ? data.frames.d1
            : data.frames.h1;

    const candles =
      interval === "15min"
        ? m15
        : interval === "4h"
          ? h4
          : interval === "1day"
            ? d1
            : h1;

    const selectedStyle =
      $("tradingStyle")
        ? $("tradingStyle").value
        : "swing";

    const mtfEngine =
      new MultiTimeframeEngine();

    const mtf =
      mtfEngine.analyze(
        d1,
        h4,
        h1,
        m15,
        selectedStyle
      );

    const styleEngine =
      new ModeAnalysisEngine();

    const styleAnalysis =
      styleEngine.analyze(
        {
          d1,
          h4,
          h1,
          m15
        },
        selectedStyle
      );

    if (
      candles.length <
      10
    ) {
      throw new Error(
        "Not enough valid candles"
      );
    }

    const structureEngine =
      new MarketStructureEngine();

    const structure =
      structureEngine.analyze(
        candles
      );

    const priceActionEngine =
      new PriceActionEngine();

    const priceAction =
      priceActionEngine.analyze(
        candles,
        structure
      );

    const smcEngine =
      new SmcIctEngine();

    const smc =
      smcEngine.analyze(
        candles,
        structure
      );

    const executionCandles =
      selectedStyle === "swing"
        ? h1
        : m15;

    const executionTimeframe =
      selectedStyle === "swing"
        ? "1H"
        : "15m";

    const executionStructureEngine =
      new MarketStructureEngine();

    const executionStructure =
      executionStructureEngine.analyze(
        executionCandles
      );

    const executionPriceEngine =
      new PriceActionEngine();

    const executionPriceAction =
      executionPriceEngine.analyze(
        executionCandles,
        executionStructure
      );

    const executionSmcEngine =
      new SmcIctEngine();

    const executionSmc =
      executionSmcEngine.analyze(
        executionCandles,
        executionStructure
      );

    const riskEngine =
      new RiskEngine();

    const risk =
      riskEngine.analyze(
        executionCandles,
        executionStructure,
        executionPriceAction,
        executionSmc,
        mtf
      );

    risk.executionTimeframe =
      executionTimeframe;

    const reasoningEngine =
      new ReasoningEngine();

    const reasoning =
      reasoningEngine.analyze(
        executionStructure,
        executionPriceAction,
        executionSmc,
        mtf,
        risk
      );

    $("marketHeader")
      .textContent =
        symbol +
        (
          exchange
            ? " • " +
              exchange
            : ""
        );

    const isIndianMarket =
      /^(NSE|BSE)$/i.test(
        String(exchange || "").trim()
      );

    $("dataSource")
      .textContent =
        selected.source ===
        "CACHE"
          ? (
              isIndianMarket
                ? "UPSTOX CACHE"
                : "TWELVE DATA CACHE"
            )
          : selected.source ===
            "15m FALLBACK"
              ? "15m FALLBACK"
              : (
                  isIndianMarket
                    ? "UPSTOX REST"
                    : "TWELVE DATA REST"
                );

    $("candleCount")
      .textContent =
        candles.length;

    $("timeframe")
      .textContent =
        interval.toUpperCase();

    const structureTimeframeLabel =
      interval === "15min"
        ? "15M"
        : interval === "1day"
          ? "1D"
          : interval.toUpperCase();

    $("structureLabel")
      .textContent =
        `MARKET STRUCTURE • ${structureTimeframeLabel}`;

    const last =
      candles[
        candles.length - 1
      ];

    $("lastPrice")
      .textContent =
        formatPrice(
          last.close,
          symbol
        );

    renderStructure(
      structure,
      symbol
    );

    renderPriceAction(
      priceAction
    );

    renderSmc(
      smc,
      symbol
    );

    renderMtf(
      mtf,
      data.counts
    );

    renderStyleAnalysis(
      styleAnalysis,
      symbol,
      risk
    );

    renderRisk(
      risk,
      symbol
    );

    renderReasoning(
      reasoning
    );

    renderWhySignal(
      {
        mtf: mtf,
        risk: risk,
        style: styleAnalysis,
        reasoning: reasoning
      },
      {
        m15: m15,
        h1: h1,
        h4: h4,
        d1: d1
      },
      selectedStyle,
      symbol
    );


    if (
      fundamentalPromise
    ) {

      void fundamentalPromise
        .then(
          fundamentalData => {

            if (
              fundamentalGeneration !==
                fundamentalRequestGeneration
            ) {
              return;
            }


            renderFundamentalAnalysis(
              fundamentalData,
              symbol,
              pairPickerState.type
            );
          }
        );
    }


    if (
      newsPromise
    ) {

      void newsPromise
        .then(
          newsData => {

            if (
              newsGeneration !==
                newsRequestGeneration
            ) {
              return;
            }


            renderNewsSentimentAnalysis(
              newsData,
              symbol,
              pairPickerState.type
            );
          }
        );
    }


    void Promise
      .all([
        fundamentalPromise,
        newsPromise
      ])
      .then(
        ([
          fundamentalData,
          newsData
        ]) => {

          if (
            fundamentalGeneration !==
              fundamentalRequestGeneration ||
            newsGeneration !==
              newsRequestGeneration
          ) {
            return;
          }


          renderReasoningWithContext(
            reasoning,
            fundamentalData,
            newsData,
            isForexMarket
          );

          const unavailable = [];
          const limited = [];

          const incomplete = value =>
            !value || /INCOMPLETE|UNAVAILABLE|NOT ENOUGH|NOT CONNECTED|PARTIAL/i.test(String(value));

          const isStockMarket =
            pairPickerState.type ===
            "stocks";

          if (!fundamentalData?.ok) {
            unavailable.push("Fundamental");
          } else if (isForexMarket) {
            if (incomplete(fundamentalData.macroComparison?.state)) {
              limited.push("Forex macro data");
            }
            if (incomplete(fundamentalData.policyRateComparison?.rateAdvantage)) {
              limited.push("Policy-rate comparison");
            }
            if (!fundamentalData.calendarConfigured) {
              limited.push("Economic calendar");
            }
          } else if (isStockMarket) {
            if (
              !fundamentalData.company?.name &&
              !fundamentalData.profile?.companyName &&
              !fundamentalData.companyName
            ) {
              limited.push("Indian stock fundamental context");
            }
          } else if (incomplete(fundamentalData.context?.state)) {
            limited.push("Crypto fundamental context");
          }

          if (!newsData?.ok) unavailable.push("News");

          $("analysisState").textContent = unavailable.length
            ? "Analysis Partial — Context Unavailable"
            : limited.length
              ? "Analysis Partial — Limited Data Coverage"
              : "Analysis Complete";

          const contextNotes = [];
          if (unavailable.length) {
            contextNotes.push("Unavailable: " + unavailable.join(", ") + ".");
          }
          if (limited.length) {
            contextNotes.push("Incomplete coverage: " + limited.join(", ") + ".");
          }

          $("analysisMessage").textContent = contextNotes.length
            ? "Technical analysis is ready. " +
              contextNotes.join(" ") +
              " See the relevant cards for details."
            : "Technical analysis is complete. Fundamental and News responses received; see each card for data coverage and freshness.";



          applyLanguageMode(
            true
          );
        }
      );


    applyLanguageMode(true);

    drawChart(
      candles
    );

    $("analysisState").textContent =
      "Technical Analysis Complete — Context Loading";

    $("analysisMessage").textContent =
      "Technical analysis is ready. Waiting for Fundamental and News data.";

    applyLanguageMode(true);

  } catch (error) {

    let message =
      String(
        error &&
        error.message
          ? error.message
          : "Market data failed"
      );


    if (
      exchange &&
      (
        /symbol.*figi/i.test(
          message
        ) ||
        /invalid symbol/i.test(
          message
        )
      )
    ) {

      message =
        symbol +
        " is not available on " +
        exchange +
        " from the current market-data provider. Choose an exchange that supports this pair.";
    }


    resetAnalysisOutput(
      symbol,
      exchange,
      interval,
      "Analysis Error",
      message
    );

  } finally {

    analyzeButton.disabled =
      false;

    const activeLanguage =
      $("languageMode")
        ? $("languageMode").value
        : "hinglish";

    analyzeButton.textContent =
      activeLanguage === "hinglish"
        ? "Market Analyze Karo"
        : (
            analyzeButton.dataset.englishText ||
            "Analyze Market"
          );
  }
}


analyzeButton.addEventListener(
  "click",
  analyze
);

setupStyleAnalysisToggle();

checkStatus();



function applyTradingStyleTimeframe() {

  const style =
    $("tradingStyle");

  const interval =
    $("interval");

  if (
    !style ||
    !interval
  ) {
    return;
  }


  if (
    style.value ===
    "scalping"
  ) {

    interval.value =
      "15min";

  } else if (
    style.value ===
    "intraday"
  ) {

    interval.value =
      "15min";

  } else {

    interval.value =
      "1h";
  }
}


const tradingStyleControl =
  $("tradingStyle");


if (
  tradingStyleControl
) {

  tradingStyleControl
    .addEventListener(
      "change",
      applyTradingStyleTimeframe
    );
}


/* =========================================
   HINGLISH / ENGLISH LANGUAGE MODE
   ========================================= */

function translateToHinglish(input) {

  if (!input) return input;

  let text = String(input);

  const replacements = [
    /* HINGLISH EXTRA V3 */
    ["Daily swing structure currently provides the bearish directional anchor, but the setup is not execution-ready.","Daily swing structure bearish direction ka basis hai, lekin setup abhi execution ke liye ready nahi hai."],
    ["4H structure is bearish and conflicts with that direction.","4H structure bearish hai aur us direction ke opposite hai."],
    ["4H structure currently opposes the bearish directional bias","4H structure abhi bearish directional bias ke opposite hai"],
    ["Daily swing structure currently provides the bullish directional anchor, but the setup is not execution-ready.","Daily swing structure bullish direction ka basis hai, lekin setup abhi execution ke liye ready nahi hai."],
    ["4H structure is bullish and conflicts with that direction.","4H structure bullish hai aur us direction ke opposite hai."],
    ["4H structure currently opposes the bullish directional bias","4H structure abhi bullish directional bias ke opposite hai"],
    ["Technical analysis is complete. Fundamental and News responses received; see each card for data coverage and freshness.","Technical analysis complete hai. Fundamental aur News responses mil gaye; data kitna complete aur recent hai, har card mein dekho."],
    ["News context supports the current technical bias, while fundamental context remains neutral.","News current technical bias ko support karti hai, jabki fundamental context neutral hai."],
    ["High news risk is present, so volatility and headline-driven moves can increase.","News risk high hai, isliye volatility aur news ki wajah se price movement badh sakta hai."],
    ["Fundamental and news context do not override the technical WAIT / TRADE-CANDIDATE decision.","Fundamental aur news context technical WAIT / TRADE-CANDIDATE decision ko override nahi karte."],
    ["Price is in discount within the current dealing range","Current dealing range mein price discount zone mein hai"],
    [" is still missing, so the disciplined action is to wait."," abhi missing hai, isliye confirmation ka wait karo."],
    ["4H structure confirmation","4H structure ki confirmation"],
    ["1H structure currently opposes bullish bias","1H structure abhi bullish bias ke opposite hai"],
    ["15m structure currently opposes bullish bias","15m structure abhi bullish bias ke opposite hai"],
    ["1H structure currently opposes bearish bias","1H structure abhi bearish bias ke opposite hai"],
    ["15m structure currently opposes bearish bias","15m structure abhi bearish bias ke opposite hai"],

    /* HINGLISH EXTRA V2 */
    ["Highest scanned body / previous average body:","Scan mein sabse bada body / pichhli average body ratio:"],
    ["Confirmed candle body / previous average body:","Confirmed candle ka body / pichhli average body ratio:"],
    ["Required: body >= 1.50x previous 10-candle average AND body >= 60% of candle range.","Zaroori: body pichhli 10 candles ki average body se kam-se-kam 1.50x ho AUR candle range ka kam-se-kam 60% ho."],
    ["No scanned candle passed both conditions.","Scan ki kisi candle ne dono conditions pass nahi ki."],
    ["Technical analysis is ready.","Technical analysis tayyar hai."],
    ["Waiting for Fundamental and News data.","Fundamental aur News data ka wait ho raha hai."],
    ["Incomplete coverage:","Adhura data:"],
    ["See the relevant cards for details.","Details ke liye sambandhit cards dekho."],
    ["External context is neutral or incomplete relative to the current technical bias.","Current technical bias ke muqable external context neutral ya adhura hai."],
    ["No active trade risk/reward until confirmation.","Confirmation tak active trade ka risk/reward available nahi hai."],
    ["A clear Daily directional structure","Daily structure ki clear direction"],
    ["1H execution direction is unresolved","1H execution ki direction abhi clear nahi hai"],

    /* HINGLISH EXTRA V1 */
    ["Technical Analysis Complete — Context Loading","Technical analysis complete hai — Fundamental aur News load ho rahe hain"],
    ["Analysis Partial — Context Unavailable","Analysis adhura hai — external context available nahi hai"],
    ["Analysis Partial — Limited Data Coverage","Analysis adhura hai — kuch data missing hai"],
    ["Daily structure has no clean direction","Daily structure ki direction abhi clear nahi hai"],
    ["1H context has no clean direction","1H context ki direction abhi clear nahi hai"],
    ["Wait for Daily structure to establish direction.","Daily structure ki direction clear hone ka wait karo."],
    ["Wait for Daily structure to establish a clear bullish or bearish direction.","Daily structure mein clear bullish ya bearish direction banne ka wait karo."],
    ["Wait for 4H bearish structure confirmation.","4H bearish structure confirm hone ka wait karo."],
    ["Wait for 4H bullish structure confirmation.","4H bullish structure confirm hone ka wait karo."],
    ["Wait for 4H structure to confirm the bearish direction.","4H structure se bearish direction confirm hone ka wait karo."],
    ["Wait for 4H structure to confirm the bullish direction.","4H structure se bullish direction confirm hone ka wait karo."],
    ["No strong displacement confirmation","Strong displacement abhi confirm nahi hua"],
    ["No validated order block","Abhi validated order block nahi mila"],
    ["Latest candle shows weak/indecisive body","Latest candle ki body weak hai; direction clear nahi hai"],
    ["No confirmed supporting evidence for the current directional thesis","Current directional thesis ko support karne wala confirmed evidence nahi mila"],


    [
      "WAIT — NO VALID ENTRY YET",
      "WAIT — Abhi valid entry nahi hai"
    ],

    [
      "NO ACTIVE ENTRY — WAIT FOR CONFIRMATION",
      "Abhi active entry nahi hai — confirmation ka wait karo"
    ],

    [
      "Analysis Complete",
      "Analysis complete hai"
    ],

    [
      "No active trade. Wait for structure and timeframe confirmation.",
      "Abhi koi active trade nahi hai. Structure aur timeframe confirmation ka wait karo."
    ],

    [
      "No active trade invalidation level until the setup is confirmed.",
      "Setup confirm hone tak koi active invalidation level nahi hai."
    ],

    [
      "Higher-timeframe bias favors buyers",
      "Higher timeframe bias buyers ke side hai"
    ],

    [
      "Higher-timeframe bias favors sellers",
      "Higher timeframe bias sellers ke side hai"
    ],

    [
      "No confirmed liquidity sweep",
      "Abhi confirmed liquidity sweep nahi mila"
    ],

    [
      "Volatility is high",
      "Volatility high hai"
    ],

    [
      "1H execution structure is not aligned",
      "1H execution structure abhi align nahi hai"
    ],

    [
      "15m execution structure is not aligned",
      "15m execution structure abhi align nahi hai"
    ],

    [
      "1H structure is not aligned with 4H bias",
      "1H structure 4H bias ke saath align nahi hai"
    ],

    [
      "4H structure is not aligned with Daily bias",
      "4H structure Daily bias ke saath align nahi hai"
    ],

    [
      "1H momentum is not confirming the swing setup",
      "1H momentum abhi Swing setup ko confirm nahi kar raha"
    ],

    [
      "Daily, 4H and 1H swing conditions are aligned",
      "Daily, 4H aur 1H Swing conditions align hain"
    ],

    [
      "4H bias, 1H structure and 15m execution are aligned",
      "4H bias, 1H structure aur 15m execution align hain"
    ]
  ];


  for (const [english, hinglish] of replacements) {

    text =
      text.split(english).join(hinglish);
  }


  text = text.replace(
    /Wait for 1H bullish execution structure\./gi,
    "1H bullish execution structure confirm hone ka wait karo."
  );

  text = text.replace(
    /Wait for 1H bearish execution structure\./gi,
    "1H bearish execution structure confirm hone ka wait karo."
  );

  text = text.replace(
    /Wait for 15m bullish execution structure\./gi,
    "15m bullish execution structure confirm hone ka wait karo."
  );

  text = text.replace(
    /Wait for 15m bearish execution structure\./gi,
    "15m bearish execution structure confirm hone ka wait karo."
  );

  text = text.replace(
    /Wait for 1H to rebuild bullish structure before looking for lower-timeframe confirmation\./gi,
    "1H mein bullish structure rebuild hone ka wait karo. Uske baad lower timeframe confirmation dekho."
  );

  text = text.replace(
    /Wait for 1H to rebuild bearish structure before looking for lower-timeframe confirmation\./gi,
    "1H mein bearish structure rebuild hone ka wait karo. Uske baad lower timeframe confirmation dekho."
  );

  text = text.replace(
    /4H bearish CHoCH warns that the bullish structure is under pressure/gi,
    "4H bearish CHoCH warning de raha hai ki bullish structure pressure mein hai"
  );

  text = text.replace(
    /4H bullish CHoCH warns that the bearish structure is under pressure/gi,
    "4H bullish CHoCH warning de raha hai ki bearish structure pressure mein hai"
  );

  text = text.replace(
    /15m structure currently opposes bullish bias/gi,
    "15m structure abhi bullish bias ke opposite hai"
  );

  text = text.replace(
    /15m structure currently opposes bearish bias/gi,
    "15m structure abhi bearish bias ke opposite hai"
  );

  text = text.replace(
    /The broader market evidence favors a bullish bias, but the setup is not execution-ready\. 1H structure confirmation is still missing, so the disciplined action is to wait\./gi,
    "Bada market context bullish side hai, lekin setup abhi execution-ready nahi hai. 1H confirmation missing hai, isliye abhi WAIT karna better hai."
  );

  text = text.replace(
    /The broader market evidence favors a bearish bias, but the setup is not execution-ready\. 1H structure confirmation is still missing, so the disciplined action is to wait\./gi,
    "Bada market context bearish side hai, lekin setup abhi execution-ready nahi hai. 1H confirmation missing hai, isliye abhi WAIT karna better hai."
  );

  text = text.replace(
    /The evidence is mixed or incomplete\. There is not enough alignment to justify an execution-ready setup\./gi,
    "Evidence mixed ya incomplete hai. Abhi execution-ready setup ke liye enough alignment nahi mila."
  );

  text = text.replace(
    /Directional evidence may exist, but the risk profile is unfavorable\. The setup should be skipped rather than forced\./gi,
    "Direction ka evidence ho sakta hai, lekin risk profile favorable nahi hai. Trade force karne ke bajay setup SKIP karo."
  );

  return text;
}


function applyLanguageMode(refreshDynamic = false) {

  const control =
    $("languageMode");

  const language =
    control
      ? control.value
      : "hinglish";


  const nodes =
    document.querySelectorAll(
      ".analysis h2, .analysis-lines, #analysisMessage"
    );


  for (const node of nodes) {
    if (node.id === "styleDetails" && node._premiumAnalysis) continue;

    const current = node.textContent;
    const saved = node.dataset.englishSource;
    const hasSource = typeof saved === "string";
    const isKnownText = hasSource &&
      (current === saved || current === translateToHinglish(saved));

    if (!hasSource || (refreshDynamic && !isKnownText)) {
      node.dataset.englishSource = current;
    }

    const english = node.dataset.englishSource;
    node.textContent = language === "hinglish"
      ? translateToHinglish(english)
      : english;
  }

const premiumDetails = $("styleDetails");
if (premiumDetails && premiumDetails._premiumAnalysis) {
  paintPremiumStyleCard(premiumDetails._premiumAnalysis);
}

const languageAnalyzeButton =
  analyzeButton;


  if (languageAnalyzeButton) {

    if (!languageAnalyzeButton.dataset.englishText) {

      languageAnalyzeButton.dataset.englishText =
        languageAnalyzeButton.textContent.trim();
    }

    languageAnalyzeButton.textContent =
      language === "hinglish"
        ? "Market Analyze Karo"
        : languageAnalyzeButton.dataset.englishText;
  }


  try {

    localStorage.setItem(
      "aiTradingLanguage",
      language
    );

  } catch {
  }
}


const languageModeControl =
  $("languageMode");


if (languageModeControl) {

  try {

    const saved =
      localStorage.getItem(
        "aiTradingLanguage"
      );

    if (
      saved === "hinglish" ||
      saved === "english"
    ) {

      languageModeControl.value =
        saved;
    }

  } catch {
  }


  languageModeControl.addEventListener(
    "change",
    () => {

      applyLanguageMode(false);
    }
  );
}


setTimeout(
  () => {

    applyLanguageMode(false);
  },
  0
);


/* === PERSIST USER PREFERENCES: tradingStyle + interval === */

(function persistReportSettings() {

  const REPORT_KEY =
    "aiTradingReportSettings";

  function readReportSettings() {
    try {
      const raw = localStorage.getItem(REPORT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return (data && typeof data === "object") ? data : null;
    } catch {
      return null;
    }
  }

  function writeReportSettings(partial) {
    try {
      const current = readReportSettings() || {};
      const next = { ...current, ...partial };
      localStorage.setItem(REPORT_KEY, JSON.stringify(next));
    } catch {
    }
  }

  const styleEl = $("tradingStyle");
  const intervalEl = $("interval");

  const saved = readReportSettings();
  if (saved) {
    if (styleEl && typeof saved.tradingStyle === "string") {
      const opt = styleEl.querySelector(
        'option[value="' + saved.tradingStyle.replace(/"/g, '\\"') + '"]'
      );
      if (opt) styleEl.value = saved.tradingStyle;
    }
    if (intervalEl && typeof saved.interval === "string") {
      const opt = intervalEl.querySelector(
        'option[value="' + saved.interval.replace(/"/g, '\\"') + '"]'
      );
      if (opt) intervalEl.value = saved.interval;
    }
  }

  if (styleEl) {
    styleEl.addEventListener("change", () => {
      writeReportSettings({ tradingStyle: styleEl.value });
    });
  }
  if (intervalEl) {
    intervalEl.addEventListener("change", () => {
      writeReportSettings({ interval: intervalEl.value });
    });
  }

})();


/* PREMIUM STYLE CARD V1 */

/* PREMIUM LANGUAGE ORDER FIX V1 */
function renderStyleAnalysis(analysis, symbol, risk) {
  renderStyleAnalysisPlain(analysis, symbol, risk);

  const details = $("styleDetails");

  if (details) {
    details._premiumAnalysis = analysis;
    details._premiumSource = details.textContent;
  }
}

function paintPremiumStyleCard(analysis) {


  const details = $("styleDetails");
  const state = $("styleState");
  if (!details || !state) return;

  state.classList.toggle(
    "premium-wait-state",
    analysis.plan.status === "WAIT"
  );

  const original =
    details._premiumSource ||
    details.textContent;
  const blocks = original.split(/\n\s*\n/);
  const fragment = document.createDocumentFragment();

  function addRows(parent, text) {
    text.split("\n").forEach(line => {
      const row = document.createElement("div");
      row.className = "style-data-row";

      const colon = line.indexOf(":");
      if (colon > 0) {
        const label = document.createElement("span");
        const value = document.createElement("strong");
        label.textContent = line.slice(0, colon) + ": ";
        value.textContent = line.slice(colon + 1).trim();
        row.append(label, value);
      } else {
        row.textContent = line;
      }

      parent.appendChild(row);
    });
  }

  blocks.forEach((block, index) => {
    if (!block.trim()) return;

    const box = document.createElement("section");
    box.className = "style-display-box";

    if (index === 0) {
      box.classList.add("style-profile");
      addRows(box, block);
    } else {
      const lines = block.split("\n");
      const heading = lines.shift().trim();
      const title = document.createElement("h3");
      title.textContent = heading;
      box.appendChild(title);

      if (heading === "TRADE PLAN") {
        box.classList.add("style-plan");
        const rows = document.createElement("div");
        rows.className = "style-plan-grid";
        addRows(rows, lines.join("\n"));
        box.appendChild(rows);
      } else {
        const content = document.createElement("div");
        content.className = "style-box-content";

/* CONFIDENCE ENGLISH DISPLAY V1 */
let displayText = lines.join("\n");

if (heading === "TRADE CONFIDENCE" &&
    $("languageMode")?.value === "english") {
  const translations = [
    ["Abhi valid trade confirm nahi hua", "No valid trade confirmed yet"],
    ["MEDIUM — Valid setup, risk control zaroori hai",
     "MEDIUM — Valid setup, risk control required"],
    ["LOW — Trade avoid karo", "LOW — Avoid the trade"]
  ];

  for (const [source, translated] of translations) {
    displayText = displayText.split(source).join(translated);
  }
}

content.textContent = $("languageMode")?.value === "hinglish"
  ? translateToHinglish(displayText)
  : displayText;


        if (heading === "BIAS") {
          if (analysis.bias === "BULLISH") {
            content.classList.add("bullish");
          } else if (analysis.bias === "BEARISH") {
            content.classList.add("bearish");
          }
        }

        if (heading === "SETUP STATUS" &&
            analysis.plan.status === "WAIT") {
          content.classList.add("premium-wait-state");
        }

        if (heading === "WHY" || heading === "NEXT CONDITION") {
          box.classList.add("style-explanation");
        }

        box.appendChild(content);
      }
    }

    fragment.appendChild(box);
  });

  details.replaceChildren(fragment);
}



/* PROFESSIONAL MARKET PAIR PICKER V1 */

const pairPickerState = {
  type:
    "crypto",

  search:
    "",

  offset:
    0,

  limit:
    100,

  loading:
    false,

  hasMore:
    true,

  requestId:
    0,

  selectedMarket:
    null,

  view:
    "all"
};


function readStoredMarketList(
  key
) {

  try {

    const value =
      JSON.parse(
        localStorage.getItem(
          key
        ) ||
        "[]"
      );


    return Array.isArray(
      value
    )
      ? value
      : [];

  } catch {

    return [];
  }
}


function writeStoredMarketList(
  key,
  value
) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(
        value
      )
    );

  } catch {
  }
}


function normalizeStoredMarket(
  market
) {

  return {
    symbol:
      String(
        market.symbol ||
        ""
      )
        .trim()
        .toUpperCase(),

    assetType:
      market.assetType === "forex"
        ? "forex"
        : market.assetType === "stocks"
          ? "stocks"
          : "crypto",

    base:
      String(
        market.base ||
        ""
      ),

    quote:
      String(
        market.quote ||
        ""
      ),

    group:
      String(
        market.group ||
        ""
      ),

    name:
      String(
        market.name ||
        ""
      ).trim(),

    exchange:
      String(
        market.exchange ||
        ""
      ).trim(),

    exchanges:
      Array.isArray(
        market.exchanges
      )
        ? market.exchanges
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
        : [],

    lastExchange:
      String(
        market.lastExchange ||
        ""
      ).trim(),

    usedAt:
      Number(
        market.usedAt ||
        0
      )
  };
}


function marketStorageKey(
  market
) {

  return (
    (
      market.assetType === "forex"
        ? "forex"
        : market.assetType === "stocks"
          ? "stocks"
          : "crypto"
    ) +
    ":" +
    String(
      market.symbol ||
      ""
    )
      .trim()
      .toUpperCase()
  );
}


function getFavoriteMarkets() {

  return readStoredMarketList(
    "aiTradingFavoriteMarkets"
  )
    .map(
      normalizeStoredMarket
    )
    .filter(
      market =>
        market.symbol
    );
}


function getRecentMarkets() {

  return readStoredMarketList(
    "aiTradingRecentMarkets"
  )
    .map(
      normalizeStoredMarket
    )
    .filter(
      market =>
        market.symbol
    );
}


function isFavoriteMarket(
  market
) {

  const key =
    marketStorageKey(
      market
    );


  return getFavoriteMarkets()
    .some(
      item =>
        marketStorageKey(
          item
        ) ===
          key
    );
}


function toggleFavoriteMarket(
  market
) {

  const normalized =
    normalizeStoredMarket(
      market
    );

  const key =
    marketStorageKey(
      normalized
    );


  let favorites =
    getFavoriteMarkets();


  const existingIndex =
    favorites.findIndex(
      item =>
        marketStorageKey(
          item
        ) ===
          key
    );


  let nowFavorite;


  if (
    existingIndex >= 0
  ) {

    favorites.splice(
      existingIndex,
      1
    );

    nowFavorite =
      false;

  } else {

    favorites.unshift(
      normalized
    );

    favorites =
      favorites.slice(
        0,
        100
      );

    nowFavorite =
      true;
  }


  writeStoredMarketList(
    "aiTradingFavoriteMarkets",
    favorites
  );


  return nowFavorite;
}


function rememberRecentMarket(
  market,
  exchange
) {

  const normalized = {
    ...normalizeStoredMarket(
      market
    ),

    lastExchange:
      String(
        exchange ||
        ""
      ).trim(),

    usedAt:
      Date.now()
  };


  const key =
    marketStorageKey(
      normalized
    );


  let recent =
    getRecentMarkets()
      .filter(
        item =>
          marketStorageKey(
            item
          ) !==
            key
      );


  recent.unshift(
    normalized
  );


  recent =
    recent.slice(
      0,
      20
    );


  writeStoredMarketList(
    "aiTradingRecentMarkets",
    recent
  );
}


function storedMarketsForCurrentView() {

  const source =
    pairPickerState.view ===
      "favorites"
      ? getFavoriteMarkets()
      : getRecentMarkets();


  const type =
    pairPickerState.type;


  const search =
    pairPickerState.search
      .trim()
      .toUpperCase();


  return source.filter(
    market => {

      if (
        market.assetType !==
          type
      ) {
        return false;
      }


      if (!search) {
        return true;
      }


      const haystack =
        [
          market.symbol,
          market.base,
          market.quote,
          market.group,
          market.lastExchange,
          ...(
            market.exchanges ||
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
  );
}


function marketTypeLabel(
  type
) {

  return type ===
    "forex"
      ? "Forex"
      : type ===
          "stocks"
        ? "Indian Stock"
        : "Crypto";
}


function updateSelectedPairDisplay(
  symbol,
  exchange,
  type
) {

  const symbolElement =
    $("selectedPairSymbol");

  const metaElement =
    $("selectedPairMeta");


  if (symbolElement) {

    symbolElement.textContent =
      symbol || "--";
  }


  if (metaElement) {

    const label =
      marketTypeLabel(
        type
      );

    metaElement.textContent =
      exchange
        ? label +
          " • " +
          exchange
        : label;
  }
}


function saveSelectedMarket(
  symbol,
  exchange,
  type
) {

  try {

    localStorage.setItem(
      "aiTradingSelectedMarket",
      JSON.stringify({
        symbol,
        exchange,
        type
      })
    );

  } catch {
  }
}


function commitSelectedMarket(
  market,
  exchange = ""
) {

  const symbol =
    String(
      market.symbol ||
      ""
    )
      .trim()
      .toUpperCase();

  const cleanExchange =
    String(
      exchange ||
      ""
    ).trim();


  if (!symbol) {
    return;
  }


  $("symbol").value =
    symbol;

  $("exchange").value =
    cleanExchange;


  pairPickerState.type =
    market.assetType === "forex"
      ? "forex"
      : market.assetType === "stocks"
        ? "stocks"
        : "crypto";


  updateSelectedPairDisplay(
    symbol,
    cleanExchange,
    pairPickerState.type
  );


  saveSelectedMarket(
    symbol,
    cleanExchange,
    pairPickerState.type
  );


  rememberRecentMarket(
    market,
    cleanExchange
  );


  fundamentalRequestGeneration++;

  newsRequestGeneration++;


  const currentInterval =
    $("interval")?.value ||
    "1h";


  resetAnalysisOutput(
    symbol,
    cleanExchange,
    currentInterval,
    "Ready for Analysis",
    "Market pair changed. Tap Market Analyze Karo to load fresh analysis."
  );


  renderNewsSentimentPlaceholder(
    symbol,
    pairPickerState.type,
    "ready"
  );


  queueMicrotask(
    () =>
      renderFundamentalReady(
        symbol,
        pairPickerState.type
      )
  );


  const fundamentalCard =
    $("fundamentalCard");


  if (
    fundamentalCard
  ) {

    if (
      pairPickerState.type ===
        "forex"
    ) {

      fundamentalCard.classList.remove(
        "hidden"
      );


      setFundamentalText(
        $("fundamentalState"),
        "Ready for Fundamental Analysis"
      );


      setFundamentalText(
        $("fundamentalDetails"),
        "Tap Market Analyze Karo to load fresh macro and central-bank data for " +
          symbol +
          "."
      );

    } else {

      fundamentalCard.classList.add(
        "hidden"
      );
    }
  }


  closePairPicker();
}


function setPairPickerStatus(
  text
) {

  const status =
    $("pairPickerStatus");

  if (status) {

    status.textContent =
      text;
  }
}


function updatePairPickerTabs() {

  document
    .querySelectorAll(
      ".pair-picker-tab"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset
            .marketType ===
            pairPickerState.type
        );
      }
    );
}


function clearExchangeChooser() {

  pairPickerState
    .selectedMarket =
      null;


  const chooser =
    $("exchangeChooser");

  const list =
    $("exchangeList");


  if (chooser) {

    chooser.classList.add(
      "hidden"
    );
  }


  if (list) {

    list.replaceChildren();
  }
}


function renderExchangeChooser(
  market
) {

  const chooser =
    $("exchangeChooser");

  const list =
    $("exchangeList");


  if (
    !chooser ||
    !list
  ) {
    return;
  }


  list.replaceChildren();


  const title =
    $("exchangeChooserTitle");


  if (title) {

    title.textContent =
      "Choose exchange for " +
      market.symbol;
  }


  const exchanges =
    Array.isArray(
      market.exchanges
    )
      ? market.exchanges
          .filter(
            Boolean
          )
      : [];


  if (
    exchanges.length === 0
  ) {

    commitSelectedMarket(
      market,
      ""
    );

    return;
  }


  pairPickerState
    .selectedMarket =
      market;


  for (
    const exchange of
      exchanges
  ) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";

    button.className =
      "exchange-chip";

    button.textContent =
      exchange;


    const currentExchange =
      String(
        $("exchange")?.value ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      String(exchange)
        .trim()
        .toUpperCase() ===
          currentExchange
    ) {

      button.classList.add(
        "selected"
      );
    }


    button.addEventListener(
      "click",
      () => {

        commitSelectedMarket(
          market,
          exchange
        );
      }
    );


    list.appendChild(
      button
    );
  }


  chooser.classList.remove(
    "hidden"
  );


  chooser.scrollIntoView({
    behavior:
      "smooth",

    block:
      "nearest"
  });
}


function isFeaturedMarket(
  market
) {

  const cryptoFeatured =
    new Set([
      "BTC/USD",
      "ETH/USD",
      "SOL/USD",
      "XRP/USD",
      "BNB/USD",
      "DOGE/USD",
      "ADA/USD",
      "LTC/USD"
    ]);


  const forexFeatured =
    new Set([
      "EUR/USD",
      "GBP/USD",
      "USD/JPY",
      "USD/CHF",
      "AUD/USD",
      "USD/CAD",
      "NZD/USD",
      "EUR/GBP"
    ]);


  const stockFeatured =
    new Set([
      "RELIANCE",
      "TCS",
      "HDFCBANK",
      "ICICIBANK",
      "INFY",
      "SBIN",
      "BHARTIARTL",
      "ITC"
    ]);


  return market.assetType === "forex"
    ? forexFeatured.has(
        market.symbol
      )
    : market.assetType === "stocks"
      ? stockFeatured.has(
          market.symbol
        )
      : cryptoFeatured.has(
          market.symbol
        );
}


function createPairRow(
  market
) {

  const row =
    document.createElement(
      "div"
    );


  row.className =
    "pair-row";


  const currentSymbol =
    String(
      $("symbol")?.value ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    market.symbol ===
      currentSymbol
  ) {

    row.classList.add(
      "selected"
    );
  }


  if (
    isFeaturedMarket(
      market
    )
  ) {

    row.classList.add(
      "featured"
    );
  }


  const selectButton =
    document.createElement(
      "button"
    );


  selectButton.type =
    "button";

  selectButton.className =
    "pair-row-select";


  const left =
    document.createElement(
      "span"
    );

  left.className =
    "pair-row-left";


  const symbol =
    document.createElement(
      "span"
    );

  symbol.className =
    "pair-row-symbol";

  symbol.textContent =
    market.symbol;


  const name =
    document.createElement(
      "span"
    );

  name.className =
    "pair-row-name";


  if (
    market.assetType ===
      "forex"
  ) {

    name.textContent =
      [
        market.base,
        market.quote,
        market.group
      ]
        .filter(
          Boolean
        )
        .join(
          " • "
        );

  } else if (
    market.assetType ===
      "stocks"
  ) {

    name.textContent =
      market.name ||
      [
        market.symbol,
        market.quote
      ]
        .filter(
          Boolean
        )
        .join(
          " • "
        );

  } else {

    name.textContent =
      [
        market.base,
        market.quote
      ]
        .filter(
          Boolean
        )
        .join(
          " / "
        );
  }


  left.append(
    symbol,
    name
  );


  const right =
    document.createElement(
      "span"
    );

  right.className =
    "pair-row-right";


  if (
    pairPickerState.view ===
      "recent" &&
    market.lastExchange
  ) {

    right.textContent =
      "Recent • " +
      market.lastExchange;

  } else if (
    market.assetType ===
      "crypto"
  ) {

    const count =
      Array.isArray(
        market.exchanges
      )
        ? market.exchanges
            .length
        : 0;


    right.textContent =
      (
        isFeaturedMarket(
          market
        )
          ? "Popular • "
          : ""
      ) +
      (
        count === 1
          ? "1 exchange"
          : count +
            " exchanges"
      );

  } else if (
    market.assetType ===
      "stocks"
  ) {

    const stockExchange =
      market.exchange ||
      market.lastExchange ||
      (
        Array.isArray(
          market.exchanges
        )
          ? market.exchanges[0]
          : ""
      ) ||
      "NSE/BSE";

    right.textContent =
      (
        isFeaturedMarket(
          market
        )
          ? "Popular • "
          : ""
      ) +
      stockExchange;

  } else {

    right.textContent =
      isFeaturedMarket(
        market
      )
        ? "Major"
        : (
            market.group ||
            "Forex"
          );
  }


  selectButton.append(
    left,
    right
  );


  selectButton.addEventListener(
    "click",
    () => {

      if (
        market.assetType ===
          "forex"
      ) {

        commitSelectedMarket(
          market,
          ""
        );

        return;
      }


      renderExchangeChooser(
        market
      );
    }
  );


  const favoriteButton =
    document.createElement(
      "button"
    );


  favoriteButton.type =
    "button";

  favoriteButton.className =
    "pair-favorite-button";


  function paintFavorite() {

    const favorite =
      isFavoriteMarket(
        market
      );


    favoriteButton.textContent =
      favorite
        ? "★"
        : "☆";


    favoriteButton.classList.toggle(
      "active",
      favorite
    );


    favoriteButton.setAttribute(
      "aria-label",
      favorite
        ? "Remove from favorites"
        : "Add to favorites"
    );
  }


  paintFavorite();


  favoriteButton.addEventListener(
    "click",
    event => {

      event.preventDefault();

      event.stopPropagation();


      toggleFavoriteMarket(
        market
      );


      if (
        pairPickerState.view ===
          "favorites"
      ) {

        void loadPairMarkets(
          true
        );

      } else {

        paintFavorite();
      }
    }
  );


  row.append(
    selectButton,
    favoriteButton
  );


  return row;
}


async function loadPairMarkets(
  reset = false
) {

  if (
    pairPickerState.loading
  ) {
    return;
  }


  if (
    !reset &&
    !pairPickerState.hasMore
  ) {
    return;
  }


  const list =
    $("pairList");


  if (!list) {
    return;
  }


  if (reset) {

    pairPickerState.offset =
      0;

    pairPickerState.hasMore =
      true;

    pairPickerState.requestId++;

    list.replaceChildren();

    clearExchangeChooser();
  }


  if (
    pairPickerState.view !==
      "all"
  ) {

    pairPickerState.loading =
      true;


    try {

      const markets =
        storedMarketsForCurrentView();


      list.replaceChildren();


      for (
        const market of
          markets
      ) {

        list.appendChild(
          createPairRow(
            market
          )
        );
      }


      pairPickerState.offset =
        markets.length;

      pairPickerState.hasMore =
        false;


      const label =
        pairPickerState.view ===
          "favorites"
          ? "favorite"
          : "recent";


      setPairPickerStatus(
        markets.length === 0
          ? (
              "No " +
              label +
              " pairs yet"
            )
          : (
              markets.length +
              " " +
              label +
              (
                markets.length === 1
                  ? " pair"
                  : " pairs"
              )
            )
      );

    } finally {

      pairPickerState.loading =
        false;
    }


    return;
  }


  const requestId =
    pairPickerState
      .requestId;


  pairPickerState.loading =
    true;


  setPairPickerStatus(
    reset
      ? "Loading market pairs…"
      : "Loading more pairs…"
  );


  try {

    const params =
      new URLSearchParams({
        type:
          pairPickerState.type,

        offset:
          String(
            pairPickerState.offset
          ),

        limit:
          String(
            pairPickerState.limit
          )
      });


    if (
      pairPickerState.search
    ) {

      params.set(
        "search",
        pairPickerState.search
      );
    }


    const response =
      await fetch(
        "/api/markets?" +
        params.toString()
      );


    const data =
      await response.json();


    if (
      requestId !==
        pairPickerState
          .requestId
    ) {
      return;
    }


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        data.error ||
        "Market pairs could not be loaded"
      );
    }


    const markets =
      Array.isArray(
        data.markets
      )
        ? data.markets
        : [];


    for (
      const market of
        markets
    ) {

      list.appendChild(
        createPairRow(
          market
        )
      );
    }


    pairPickerState.offset +=
      markets.length;


    pairPickerState.hasMore =
      Boolean(
        data.hasMore
      );


    if (
      pairPickerState.offset ===
        0
    ) {

      setPairPickerStatus(
        "No matching pairs found"
      );

    } else {

      setPairPickerStatus(
        String(
          data.matched
        ) +
        " pairs found" +
        (
          data.hasMore
            ? " • Scroll for more"
            : ""
        )
      );
    }

  } catch (
    error
  ) {

    setPairPickerStatus(
      error.message ||
      "Market pairs could not be loaded"
    );

  } finally {

    pairPickerState.loading =
      false;
  }
}


function updatePairPickerViewTabs() {

  document
    .querySelectorAll(
      ".pair-view-tab"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset
            .pairView ===
            pairPickerState.view
        );
      }
    );
}


function switchPairView(
  view
) {

  if (
    view !== "all" &&
    view !== "favorites" &&
    view !== "recent"
  ) {
    return;
  }


  if (
    pairPickerState.view ===
      view
  ) {
    return;
  }


  pairPickerState.view =
    view;


  updatePairPickerViewTabs();


  pairPickerState.requestId++;


  void loadPairMarkets(
    true
  );
}


function openPairPicker() {

  const overlay =
    $("pairPickerOverlay");


  if (!overlay) {
    return;
  }


  overlay.classList.remove(
    "hidden"
  );

  overlay.setAttribute(
    "aria-hidden",
    "false"
  );


  document.body.style
    .overflow =
      "hidden";


  pairPickerState.view =
    "all";


  updatePairPickerTabs();

  updatePairPickerViewTabs();


  const search =
    $("pairSearch");


  if (search) {

    search.value =
      "";

    pairPickerState.search =
      "";
  }


  pairPickerState.offset =
    0;

  pairPickerState.hasMore =
    true;

  pairPickerState.requestId++;


  void loadPairMarkets(
    true
  );


  setTimeout(
    () => {

      if (search) {

        search.focus({
          preventScroll:
            true
        });
      }
    },
    120
  );
}


function closePairPicker() {

  const overlay =
    $("pairPickerOverlay");


  if (!overlay) {
    return;
  }


  overlay.classList.add(
    "hidden"
  );

  overlay.setAttribute(
    "aria-hidden",
    "true"
  );


  document.body.style
    .overflow =
      "";


  clearExchangeChooser();
}


function switchPairMarketType(
  type
) {

  if (
    type !== "crypto" &&
    type !== "forex" &&
    type !== "stocks"
  ) {
    return;
  }


  if (
    pairPickerState.type ===
      type
  ) {
    return;
  }


  pairPickerState.type =
    type;


  updatePairPickerTabs();


  const search =
    $("pairSearch");


  if (search) {

    search.value =
      "";

    pairPickerState.search =
      "";
  }


  pairPickerState.requestId++;

  void loadPairMarkets(
    true
  );
}


function initializePairPicker() {

  const button =
    $("pairPickerButton");

  const close =
    $("pairPickerClose");

  const overlay =
    $("pairPickerOverlay");

  const search =
    $("pairSearch");

  const list =
    $("pairList");


  if (
    !button ||
    !overlay
  ) {
    return;
  }


  try {

    const saved =
      JSON.parse(
        localStorage.getItem(
          "aiTradingSelectedMarket"
        ) ||
        "null"
      );


    if (
      saved &&
      typeof saved.symbol ===
        "string"
    ) {

      const type =
        saved.type === "forex"
          ? "forex"
          : saved.type === "stocks"
            ? "stocks"
            : "crypto";

      const symbol =
        saved.symbol
          .trim()
          .toUpperCase();

      const exchange =
        String(
          saved.exchange ||
          ""
        ).trim();


      if (symbol) {

        $("symbol").value =
          symbol;

        $("exchange").value =
          exchange;

        pairPickerState.type =
          type;


        updateSelectedPairDisplay(
          symbol,
          exchange,
          type
        );


        $("marketHeader")
          .textContent =
            symbol +
            (
              exchange
                ? " • " +
                  exchange
                : ""
            );


        renderNewsSentimentPlaceholder(
          symbol,
          type,
          "ready"
        );


        queueMicrotask(
          () =>
            renderFundamentalReady(
              symbol,
              type
            )
        );


        const fundamentalCard =
          $("fundamentalCard");


        if (
          fundamentalCard
        ) {

          if (
            type === "forex"
          ) {

            fundamentalCard.classList.remove(
              "hidden"
            );


            setFundamentalText(
              $("fundamentalState"),
              "Ready for Fundamental Analysis"
            );


            setFundamentalText(
              $("fundamentalDetails"),
              "Tap Market Analyze Karo to load fresh macro, policy-rate and economic-event data for " +
                symbol +
                "."
            );

          } else {

            fundamentalCard.classList.add(
              "hidden"
            );
          }
        }
      }
    }

  } catch {
  }


  button.addEventListener(
    "click",
    openPairPicker
  );


  if (close) {

    close.addEventListener(
      "click",
      closePairPicker
    );
  }


  overlay.addEventListener(
    "click",
    event => {

      if (
        event.target ===
          overlay
      ) {

        closePairPicker();
      }
    }
  );


  document
    .querySelectorAll(
      ".pair-picker-tab"
    )
    .forEach(
      tab => {

        tab.addEventListener(
          "click",
          () => {

            switchPairMarketType(
              tab.dataset
                .marketType
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      ".pair-view-tab"
    )
    .forEach(
      tab => {

        tab.addEventListener(
          "click",
          () => {

            switchPairView(
              tab.dataset
                .pairView
            );
          }
        );
      }
    );


  let searchTimer =
    null;


  if (search) {

    search.addEventListener(
      "input",
      () => {

        clearTimeout(
          searchTimer
        );


        searchTimer =
          setTimeout(
            () => {

              pairPickerState.search =
                search.value
                  .trim()
                  .toUpperCase();

              pairPickerState.requestId++;

              void loadPairMarkets(
                true
              );
            },
            250
          );
      }
    );
  }


  if (list) {

    list.addEventListener(
      "scroll",
      () => {

        const remaining =
          list.scrollHeight -
          list.scrollTop -
          list.clientHeight;


        if (
          remaining <
            220
        ) {

          void loadPairMarkets(
            false
          );
        }
      }
    );
  }


  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
          "Escape" &&
        !overlay.classList
          .contains(
            "hidden"
          )
      ) {

        closePairPicker();
      }
    }
  );
}


initializePairPicker();

/* ===== HISTORY-STYLE ENGINE CARDS FINAL ===== */

function setupHistoryStyleEngineCards() {

  document
    .querySelectorAll(
      ".engine-history-head"
    )
    .forEach(head => {

      if (
        head.dataset.toggleReady ===
        "true"
      ) {
        return;
      }

      const card =
        head.closest(".analysis");

      const body =
        card?.querySelector(
          ".engine-history-body"
        );

      const icon =
        head.querySelector(
          ".engine-history-icon"
        );

      if (!card || !body || !icon) {
        return;
      }

      head.dataset.toggleReady =
        "true";

      const toggleCard =
        () => {

          const open =
            card.classList.toggle(
              "engine-history-expanded"
            );

          body.classList.toggle(
            "engine-history-body-collapsed",
            !open
          );

          head.setAttribute(
            "aria-expanded",
            String(open)
          );

          icon.textContent =
            open ? "▲" : "▼";
        };

      head.addEventListener(
        "click",
        toggleCard
      );

      head.addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            toggleCard();
          }
        }
      );
    });
}

setupHistoryStyleEngineCards();
