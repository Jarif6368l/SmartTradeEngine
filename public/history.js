(() => {

  const $ =
    id =>
      document.getElementById(
        id
      );

  let allHistory = [];

  const expandedSignalIds = new Set();



  function valueOrDash(
    value
  ) {

    return (
      value === null ||
      value === undefined ||
      value === ""
    )
      ? "--"
      : String(value);
  }


  function formatTime(
    iso
  ) {

    if (!iso) {
      return "--";
    }

    const date =
      new Date(iso);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "--";
    }

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

        second:
          "2-digit",

        hour12:
          true
      }
    ).format(date).toUpperCase() +
      " IST";
  }


  function isMissingNumericValue(
    value
  ) {

    return (
      value === null ||
      value === undefined ||
      (
        typeof value ===
          "string" &&
        value.trim() === ""
      )
    );
  }


  function formatPrice(
    value,
    symbol
  ) {

    if (
      isMissingNumericValue(
        value
      )
    ) {
      return "--";
    }


    const number =
      Number(value);

    if (
      !Number.isFinite(
        number
      )
    ) {
      return "--";
    }

    let digits = 2;

    if (
      String(symbol)
        .includes("JPY")
    ) {

      digits = 3;

    } else if (
      String(symbol)
        .includes("/") &&
      !String(symbol)
        .startsWith("BTC/") &&
      !String(symbol)
        .startsWith("ETH/") &&
      !String(symbol)
        .startsWith("SOL/") &&
      !String(symbol)
        .startsWith("XRP/")
    ) {

      digits = 5;

    } else if (
      number < 1
    ) {

      digits = 6;

    } else if (
      number < 100
    ) {

      digits = 4;
    }

    return number
      .toLocaleString(
        "en-US",
        {
          minimumFractionDigits:
            digits,

          maximumFractionDigits:
            digits
        }
      );
  }


  function formatRR(
    value
  ) {

    if (
      isMissingNumericValue(
        value
      )
    ) {
      return "--";
    }


    const number =
      Number(value);

    return Number.isFinite(
      number
    )
      ? "1 : " +
        number.toFixed(2)
      : "--";
  }


  function historyText(value) {
    if (value == null) return "";
    let text = String(value);
    let language = "hinglish";
    try {
      language = localStorage.getItem("aiTradingLanguage") || "hinglish";
    } catch {}
    if (language !== "hinglish") return text;
    /* HISTORY EXTRA V2 */
    const extraPairs = [["Structure, multi-timeframe alignment and risk conditions currently form a trade candidate. This remains a probabilistic setup, not a guaranteed outcome.","Structure, multi-timeframe alignment aur risk conditions ke basis par trade candidate bana hai. Yeh probability-based setup hai; result guaranteed nahi hai."],["1H direction and 15m execution are aligned","1H direction aur 15m execution aligned hain"],["Structure, timeframe alignment and risk conditions passed","Structure, timeframe alignment aur risk conditions ke checks pass hue"],["Multi-timeframe conditions are aligned","Multi-timeframe conditions aligned hain"],["Execution-timeframe conditions are aligned","Execution timeframe ki conditions aligned hain"],["Risk/reward scenario is at least 1:2","Risk/reward scenario kam-se-kam 1:2 hai"],["Active bullish FVG is detected","Active bullish FVG mila hai"],["Active bearish FVG is detected","Active bearish FVG mila hai"],["Bullish BOS is present","Bullish BOS maujood hai"],["Bearish BOS is present","Bearish BOS maujood hai"],["Setup no longer meets TRADE-CANDIDATE rules","Setup ab TRADE-CANDIDATE rules poore nahi karta"],["Stop reached after Target 1 had already been touched","Target 1 touch hone ke baad stop hit hua"],["Stop Loss reached","Stop Loss hit hua"],["Target 2 reached","Target 2 hit hua"]];
    for (const [english, hinglish] of extraPairs) {
      text = text.split(english).join(hinglish);
    }
    const pairs = [["No confirmed liquidity sweep","Abhi confirmed liquidity sweep nahi mila"],["No strong displacement confirmation","Strong displacement abhi confirm nahi hua"],["No validated order block","Abhi validated order block nahi mila"],["Market structure is bullish","Market structure bullish hai"],["Market structure is bearish","Market structure bearish hai"],["Recent momentum favors buyers","Recent momentum buyers ke side hai"],["Recent momentum favors sellers","Recent momentum sellers ke side hai"],["SMC evidence leans bullish","SMC evidence bullish side hai"],["SMC evidence leans bearish","SMC evidence bearish side hai"],["No major confirmation missing","Koi major confirmation missing nahi hai"],["Latest candle shows weak/indecisive body","Latest candle ki body weak hai; direction clear nahi hai"],["4H structure is not directional","4H structure ki direction clear nahi hai"],["Price is in premium within the current dealing range","Current dealing range mein price premium zone mein hai"],["Volatility is high","Volatility high hai"],["Conditions are aligned; risk controls still remain mandatory.","Conditions aligned hain; risk controls phir bhi zaroori hain."]];
    for (const [english, hinglish] of pairs) {
      text = text.split(english).join(hinglish);
    }
    return text;
  }

  function make(
    tag,
    className,
    text
  ) {

    const el =
      document.createElement(
        tag
      );

    if (className) {
      el.className =
        className;
    }

    if (
      text !== undefined
    ) {
      el.textContent = historyText(text);
    }

    return el;
  }


  function addDataBox(
    grid,
    label,
    value
  ) {

    const box =
      make(
        "div",
        "data-box"
      );

    box.append(
      make(
        "span",
        "",
        label
      ),

      make(
        "strong",
        "",
        value
      )
    );

    grid.appendChild(
      box
    );
  }


  function addLogicBox(
    grid,
    label,
    value
  ) {

    if (
      !value ||
      String(value).trim() === ""
    ) {
      return;
    }

    const box =
      make(
        "div",
        "logic-box"
      );

    const pre =
      make(
        "pre",
        "",
        String(value)
      );

    box.append(
      make(
        "span",
        "",
        label
      ),

      pre
    );

    grid.appendChild(
      box
    );
  }


  function directionClass(
    direction
  ) {

    const text =
      String(direction || "")
        .toUpperCase();

    if (
      text.includes(
        "BULLISH"
      )
    ) {
      return "bullish";
    }

    if (
      text.includes(
        "BEARISH"
      )
    ) {
      return "bearish";
    }

    return "neutral";
  }


  function getOutcome(
    row
  ) {

    if (row.outcome) {
      return String(
        row.outcome
      ).toUpperCase();
    }

    return row.status === "ACTIVE"
      ? "OPEN"
      : "INACTIVE";
  }


  function outcomeLabel(
    outcome
  ) {

    return String(
      outcome || "OPEN"
    )
      .replace(
        /_/g,
        " "
      );
  }


  function outcomeClass(
    outcome
  ) {

    const value =
      String(
        outcome || ""
      ).toUpperCase();

    if (value === "T1_HIT") {
      return "outcome-t1";
    }

    if (value === "T2_HIT") {
      return "outcome-t2";
    }

    if (value === "SL_HIT") {
      return "outcome-sl";
    }

    if (value === "INVALIDATED") {
      return "outcome-invalidated";
    }

    if (value === "AMBIGUOUS") {
      return "outcome-ambiguous";
    }

    if (value === "EXPIRED") {
      return "outcome-expired";
    }

    if (
      value === "STYLE_CHANGED"
    ) {
      return "outcome-style-changed";
    }

    return "outcome-open";
  }


  function formatDuration(
    row
  ) {

    let minutes =
      isMissingNumericValue(
        row.durationMinutes
      )
        ? NaN
        : Number(
            row.durationMinutes
          );

    if (
      !Number.isFinite(minutes) &&
      row.status === "ACTIVE" &&
      row.sentAt
    ) {

      const sent =
        Date.parse(
          row.sentAt
        );

      if (
        Number.isFinite(sent)
      ) {

        minutes =
          Math.max(
            0,
            Math.floor(
              (
                Date.now() -
                sent
              ) /
              60000
            )
          );
      }
    }

    if (
      !Number.isFinite(minutes)
    ) {
      return "--";
    }

    minutes =
      Math.max(
        0,
        Math.round(minutes)
      );

    if (minutes < 60) {
      return minutes + " min";
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    const remaining =
      minutes % 60;

    if (hours < 24) {
      return remaining
        ? hours +
            "h " +
            remaining +
            "m"
        : hours + "h";
    }

    const days =
      Math.floor(
        hours / 24
      );

    const remainingHours =
      hours % 24;

    return remainingHours
      ? days +
          "d " +
          remainingHours +
          "h"
      : days + "d";
  }


  function formatRValue(
    value,
    signed = false
  ) {

    if (
      isMissingNumericValue(
        value
      )
    ) {
      return "--";
    }


    const number =
      Number(value);

    if (
      !Number.isFinite(number)
    ) {
      return "--";
    }

    const prefix =
      signed &&
      number > 0
        ? "+"
        : "";

    return prefix +
      number.toFixed(2) +
      "R";
  }


  function outcomeTime(
    row
  ) {

    return (
      row.outcomeAt ||
      row.t2HitAt ||
      row.slHitAt ||
      row.t1HitAt ||
      row.closedAt ||
      null
    );
  }

  function outcomeTimeLabel(
    row
  ) {

    if (row.outcomeTimePrecision === "DETECTION_TIME") {
      return "OUTCOME DETECTED AT";
    }


    return (
      row.outcomeTimePrecision ===
        "CANDLE_CLOSE_APPROX"
        ? "OUTCOME TIME (APPROX)"
        : "OUTCOME TIME"
    );
  }


  function outcomeTrackingLabel(
    row
  ) {

    if (
      row.outcomeTrackingMethod === "SETUP_STATE_CHANGE" &&
      row.outcomeTimePrecision === "DETECTION_TIME"
    ) {
      return "Setup status change • detection time";
    }


    if (
      row.outcomeTrackingMethod ===
        "CLOSED_CANDLE_CONFIRMATION" &&
      row.outcomeTimePrecision ===
        "CANDLE_CLOSE_APPROX"
    ) {

      return (
        "Closed candle • " +
        "approximate close time"
      );
    }


    if (
      outcomeTime(
        row
      )
    ) {

      return (
        "Legacy record • " +
        "timing precision unavailable"
      );
    }


    return "--";
  }



  /* === WHY THIS SIGNAL WAS CONFIRMED — history render === */

  function renderWhySignalHistory(row) {

    const wrap = make("div", "why-signal-card");

    const why = row && row.signalWhy;

    /* Stable key for WHY expand-state persistence */
    const whyKey =
      row && row.id != null
        ? String(row.id)
        : null;

    const isExpanded = false;

    const heading = make("div", "why-signal-heading");
    heading.setAttribute("role", "button");
    heading.setAttribute("tabindex", "0");
    heading.setAttribute(
      "aria-expanded",
      isExpanded ? "true" : "false"
    );

    const headLeft = make("div");
    headLeft.appendChild(make("div", "why-signal-label", "CONFIRMATION"));

    const historyRiskDecision =
      (why && why.finalCheck && why.finalCheck.riskDecision) ||
      (row && row.riskDecision) ||
      "WAIT";
    const historyIsConfirmed =
      String(historyRiskDecision).toUpperCase() === "TRADE-CANDIDATE";

    headLeft.appendChild(
      make(
        "h3",
        "why-signal-title",
        historyIsConfirmed
          ? "WHY THIS SIGNAL WAS CONFIRMED"
          : "WHY THIS SIGNAL IS STILL WAITING"
      )
    );
    heading.appendChild(headLeft);

    const arrow = make("span", "why-signal-arrow");
    arrow.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    heading.appendChild(arrow);

    const bodyEl = make(
      "div",
      "why-signal-body" +
        (isExpanded ? "" : " why-signal-collapsed")
    );

    if (!why || why.version !== 1 || why.error) {
      bodyEl.appendChild(
        make(
          "div",
          "why-signal-empty",
          "Detailed confirmation data not available for this record."
        )
      );
    } else {
      bodyEl.appendChild(buildWhySignalHistoryBody(why));
    }

    wrap.appendChild(heading);
    wrap.appendChild(bodyEl);

    const toggle = () => {
      const open = heading.getAttribute("aria-expanded") === "true";
      const nextOpen = !open;
      heading.setAttribute("aria-expanded", String(nextOpen));
      bodyEl.classList.toggle("why-signal-collapsed", !nextOpen);


    };
    heading.addEventListener("click", toggle);
    heading.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });

    return wrap;
  }


  function buildWhySignalHistoryBody(why) {

    const container = make("div", "why-signal-content");

    const safe = v =>
      (v === undefined || v === null || v === "") ? "—" : String(v);

    const row = (label, value, kind) => {
      const r = make("div", "why-row");
      r.appendChild(make("span", "why-row-label", label));
      const valWrap = make("span", "why-row-value");
      const marker = make("span", "why-marker why-marker-" + kind);
      marker.textContent = kind === "gate" ? "●" : kind === "info" ? "○" : "·";
      marker.title =
        kind === "gate" ? "Confirmation gate" :
        kind === "info" ? "Informational only" :
        "Not calculated";
      valWrap.appendChild(marker);
      valWrap.appendChild(document.createTextNode(" " + safe(value)));
      r.appendChild(valWrap);
      return r;
    };

    const section = (title, rows) => {
      const s = make("div", "why-section");
      s.appendChild(make("div", "why-section-title", title));
      rows.forEach(x => s.appendChild(x));
      return s;
    };

    const ms = why.marketStructure || {};
    const smc = why.smc || {};
    const mtf = why.mtf || {};
    const pa = why.priceAction || {};
    const rk = why.risk || {};
    const fc = why.finalCheck || {};

    container.appendChild(section("1. MARKET STRUCTURE", [
      row("Trend", ms.trend, "gate"),
      row("BOS / CHoCH", ms.lastEvent, "info"),
      row("HH / HL / LH / LL", [ms.hh, ms.hl, ms.lh, ms.ll].join(" / "), "info"),
      row("Support", ms.support, "info"),
      row("Resistance", ms.resistance, "info")
    ]));

    container.appendChild(section("2. SMC / ICT", [
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
    ]));

    container.appendChild(section("3. MTF", [
      row("1D", (mtf.daily && mtf.daily.structure) || "—", "info"),
      row("4H", (mtf.fourHour && mtf.fourHour.structure) || "—", "info"),
      row("1H", (mtf.oneHour && mtf.oneHour.structure) || "—", "info"),
      row("15m", (mtf.fifteenMinute && mtf.fifteenMinute.structure) || "—", "info"),
      row("HTF Bias", mtf.higherTimeframeBias, "info"),
      row("Alignment", mtf.alignment, "info"),
      row("Execution State", mtf.executionState, "gate"),
      row("Confidence", mtf.confidence, "info"),
      row("Weighted Bull / Bear", [mtf.weightedBull, mtf.weightedBear].join(" / "), "info")
    ]));

    container.appendChild(section("4. PRICE ACTION", [
      row("Candle Direction", pa.candleDirection, "info"),
      row("Candle Strength", pa.candleStrength, "info"),
      row("Rejection", pa.rejection, "info"),
      row("Breakout", pa.breakout, "info"),
      row("Momentum", pa.momentum, "info"),
      row("Body %", pa.bodyPercent, "info"),
      row("Upper Wick %", pa.upperWickPercent, "info"),
      row("Lower Wick %", pa.lowerWickPercent, "info")
    ]));

    container.appendChild(section("5. RISK", [
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
      row("SETUP QUALITY", rk.setupQuality, "info"),
      row("Risk Decision", rk.decision, "gate"),
      row("Risk Reason", rk.reason, "info")
    ]));

    container.appendChild(section("6. FINAL CHECK", [
      row("Style Plan Status", fc.stylePlanStatus, "gate"),
      row("Risk Decision", fc.riskDecision, "gate"),
      row("Candidate Levels Valid", fc.candidateLevelValid ? "YES" : "NO", fc.candidateLevelValid ? "gate" : "info"),
      row("Final Bias", fc.finalBias, "info"),
      row("Final State", fc.finalState, "info"),
      row("Confidence", fc.confidence, "info"),
      row("Missing Confirmation", fc.missingConfirmation, "info")
    ]));

    container.appendChild(
      make(
        "div",
        "why-signal-disclaimer",
        "This is an engine confluence evaluation, not a guaranteed win."
      )
    );

    return container;
  }

function renderCard(
    row
  ) {

    const card =
      make(
        "article",
        "signal-card"
      );

    const head =
      make(
        "div",
        "signal-head"
      );

    const headLeft =
      make("div");

    headLeft.append(
      make(
        "div",
        "signal-pair",
        row.symbol ||
          "Unknown Pair"
      ),

      make(
        "div",
        "signal-sub",
        [
          row.marketType
            ? String(
                row.marketType
              ).toUpperCase()
            : "",

          row.exchange ||
            ""
        ]
          .filter(Boolean)
          .join(" • ")
      )
    );


    const statusWrap =
      make(
        "div",
        "signal-status-wrap"
      );

    const status =
      make(
        "span",
        "signal-status " +
          (
            row.status ===
              "ACTIVE"
              ? "active"
              : "inactive"
          ),
        row.status ||
          "UNKNOWN"
      );

    statusWrap.appendChild(
      status
    );

    const expandIcon =
      make(
        "span",
        "signal-expand-icon",
        "▼"
      );

    statusWrap.appendChild(
      expandIcon
    );

    head.append(
      headLeft,
      statusWrap
    );

    head.setAttribute(
      "role",
      "button"
    );

    head.setAttribute(
      "tabindex",
      "0"
    );

    head.setAttribute(
      "aria-expanded",
      "false"
    );


    const body =
      make(
        "div",
        "signal-body signal-body-collapsed"
      );

    const signalKey = row.id == null ? null : String(row.id);
if (signalKey !== null && expandedSignalIds.has(signalKey)) {
  card.classList.add("expanded");
  body.classList.remove("signal-body-collapsed");
  head.setAttribute("aria-expanded", "true");
  expandIcon.textContent = "▲";
}

const toggleCard =
      () => {

        const isOpen =
          card.classList.toggle(
            "expanded"
          );

        if (signalKey !== null) {
  if (isOpen) {
    expandedSignalIds.add(signalKey);
  } else {
    expandedSignalIds.delete(signalKey);
  }
}

body.classList.toggle(
          "signal-body-collapsed",
          !isOpen
        );

        head.setAttribute(
          "aria-expanded",
          String(isOpen)
        );

        expandIcon.textContent =
          isOpen
            ? "▲"
            : "▼";
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


    const badges =
      make("div");

    badges.append(
      make(
        "span",
        "direction-pill " +
          directionClass(
            row.direction
          ),
        row.direction ||
          "UNKNOWN"
      ),

      make(
        "span",
        "style-pill",
        row.styleLabel ||
          row.mode ||
          "--"
      )
    );


    const outcome =
      getOutcome(
        row
      );

    badges.appendChild(
      make(
        "span",
        "outcome-pill " +
          outcomeClass(
            outcome
          ),
        outcomeLabel(
          outcome
        )
      )
    );


    body.append(
      badges,

      make(
        "div",
        "signal-time",
        "SIGNAL TIME: " +
          formatTime(
            row.sentAt
          )
      )
    );


    const grid =
      make(
        "div",
        "trade-grid"
      );

    addDataBox(
      grid,
      "ENTRY ZONE",
      formatPrice(
        row.entryLow,
        row.symbol
      ) +
      " → " +
      formatPrice(
        row.entryHigh,
        row.symbol
      )
    );

    addDataBox(
      grid,
      "REFERENCE",
      formatPrice(
        row.entryReference,
        row.symbol
      )
    );

    addDataBox(
      grid,
      "STOP LOSS",
      formatPrice(
        row.stopLoss,
        row.symbol
      )
    );

    addDataBox(
      grid,
      "TARGET 1",
      formatPrice(
        row.target1,
        row.symbol
      )
    );

    addDataBox(
      grid,
      "R:R T1",
      formatRR(
        row.rr1
      )
    );

    addDataBox(
      grid,
      "TARGET 2",
      formatPrice(
        row.target2,
        row.symbol
      )
    );

    addDataBox(
      grid,
      "R:R T2",
      formatRR(
        row.rr2
      )
    );

    addDataBox(
      grid,
      "EXECUTION",
      valueOrDash(
        row.executionTimeframe
      )
    );

    addDataBox(
      grid,
      "VOLATILITY",
      valueOrDash(
        row.volatility
      )
    );

    addDataBox(
      grid,
      "MTF CONFIDENCE",
      valueOrDash(
        row.mtfConfidence
      )
    );

    addDataBox(
      grid,
      "DATA SOURCE",
      valueOrDash(
        row.dataSource
      )
    );

    addDataBox(
      grid,
      "ENGINE VERSION",
      valueOrDash(
        row.engineVersion
      )
    );

    addDataBox(
      grid,
      "DATA AS OF",
      formatTime(
        row.dataAsOf
      )
    );

    addDataBox(
      grid,
      "OUTCOME",
      outcomeLabel(
        outcome
      )
    );

    addDataBox(
      grid,
      "DURATION",
      formatDuration(
        row
      )
    );

    addDataBox(
      grid,
      "MAX R REACHED",
      formatRValue(
        row.maxRReached
      )
    );

    addDataBox(
      grid,
      outcomeTimeLabel(
        row
      ),
      formatTime(
        outcomeTime(
          row
        )
      )
    );

    addDataBox(
      grid,
      "OUTCOME TRACKING",
      outcomeTrackingLabel(
        row
      )
    );

    addDataBox(
      grid,
      "LEVEL RESULT R",
      formatRValue(
        row.outcomeR,
        true
      )
    );

    body.appendChild(
      grid
    );


    const quality =
      Math.max(
        0,
        Math.min(
          100,
          Number(
            row.setupQuality
          ) || 0
        )
      );

    const qualityRow =
      make(
        "div",
        "quality-row"
      );

    const track =
      make(
        "div",
        "quality-track"
      );

    const fill =
      make(
        "div",
        "quality-fill"
      );

    fill.style.width =
      quality + "%";

    track.appendChild(
      fill
    );

    qualityRow.append(
      make(
        "span",
        "",
        "SETUP QUALITY"
      ),

      track,

      make(
        "span",
        "quality-value",
        Math.round(
          quality
        ) + "%"
      )
    );

    body.appendChild(
      qualityRow
    );


    const details =
      make(
        "details",
        "logic-details"
      );

    details.appendChild(
      make(
        "summary",
        "",
        "SIGNAL KE PICHE POORA LOGIC DEKHEN"
      )
    );

    const logicGrid =
      make(
        "div",
        "logic-grid"
      );

    addLogicBox(
      logicGrid,
      "STYLE DECISION",
      (
        row.styleDecision ||
        "--"
      ) +
      (
        row.styleReason
          ? "\nREASON: " +
            row.styleReason
          : ""
      )
    );

    addLogicBox(
      logicGrid,
      "MTF EXECUTION STATE",
      row.mtfExecutionState
    );

    addLogicBox(
      logicGrid,
      "HIGHER TIMEFRAME BIAS",
      row.higherTimeframeBias
    );

    addLogicBox(
      logicGrid,
      "ALIGNMENT",
      row.alignment
    );

    addLogicBox(
      logicGrid,
      "WEIGHTED EVIDENCE",
      `Bull: ${Number(row.weightedBull) || 0} • Bear: ${Number(row.weightedBear) || 0}`
    );

    addLogicBox(
      logicGrid,
      "RISK ENGINE",
      (
        row.riskDecision ||
        "--"
      ) +
      (
        row.riskReason
          ? "\nREASON: " +
            row.riskReason
          : ""
      )
    );

    addLogicBox(
      logicGrid,
      "FINAL THESIS",
      row.thesis
    );

    addLogicBox(
      logicGrid,
      "SUPPORTING EVIDENCE",
      row.supportingEvidence
    );

    addLogicBox(
      logicGrid,
      "CONFLICTING / CAUTION",
      row.conflictingEvidence
    );

    addLogicBox(
      logicGrid,
      "MISSING CONFIRMATION",
      row.missingConfirmation
    );

    addLogicBox(
      logicGrid,
      "NEXT CONDITION",
      row.reasoningNextCondition ||
      row.styleNextCondition
    );

    addLogicBox(
      logicGrid,
      "INVALIDATION",
      row.invalidation
    );

    details.appendChild(
      logicGrid
    );

    body.appendChild(
      details
    );


    body.appendChild(renderWhySignalHistory(row));

    if (
      row.status ===
        "INACTIVE"
    ) {

      body.appendChild(
        make(
          "div",
          "closed-line",
          (
            row.outcomeTimePrecision ===
              "CANDLE_CLOSE_APPROX"
              ? "INACTIVE TIME (APPROX): "
              : "INACTIVE TIME: "
          ) +
            formatTime(
              row.closedAt
            ) +
            (
              row.closedReason
                ? "\nREASON: " +
                  row.closedReason
                : ""
            )
        )
      );
    }


    card.append(
      head,
      body
    );

    return card;
  }


  function applyHistoryFilters(
    rows
  ) {

    const pair =
      $("pairFilter").value;

    const style =
      $("styleFilter").value;

    const status =
      $("statusFilter").value;

    const outcome =
      $("outcomeFilter").value;

    const direction =
      $("directionFilter").value;

    const minimumQuality =
      Number(
        $("qualityFilter").value
      );

    const dateMode =
      $("dateFilter").value;

    const now =
      new Date();

    let fromTime =
      null;

    let toTime =
      null;


    if (dateMode === "today") {

      const start =
        new Date();

      start.setHours(
        0,
        0,
        0,
        0
      );

      fromTime =
        start.getTime();

    } else if (
      dateMode === "7d"
    ) {

      fromTime =
        now.getTime() -
        7 * 24 * 60 * 60 * 1000;

    } else if (
      dateMode === "30d"
    ) {

      fromTime =
        now.getTime() -
        30 * 24 * 60 * 60 * 1000;

    } else if (
      dateMode === "custom"
    ) {

      const from =
        $("dateFrom").value;

      const to =
        $("dateTo").value;

      if (from) {

        const d =
          new Date(
            from + "T00:00:00"
          );

        if (
          !Number.isNaN(
            d.getTime()
          )
        ) {
          fromTime =
            d.getTime();
        }
      }

      if (to) {

        const d =
          new Date(
            to + "T23:59:59.999"
          );

        if (
          !Number.isNaN(
            d.getTime()
          )
        ) {
          toTime =
            d.getTime();
        }
      }
    }


    return rows
      .filter(
        row =>
          !pair ||
          row.symbol === pair
      )
      .filter(
        row =>
          !style ||
          row.mode === style
      )
      .filter(
        row =>
          !status ||
          row.status === status
      )
      .filter(
        row =>
          !outcome ||
          getOutcome(row) ===
            outcome
      )
      .filter(
        row =>
          !direction ||
          String(
            row.direction || ""
          )
            .toUpperCase()
            .includes(direction)
      )
      .filter(
        row =>
          !Number.isFinite(
            minimumQuality
          ) ||
          minimumQuality <= 0 ||
          Number(
            row.setupQuality
          ) >= minimumQuality
      )
      .filter(
        row => {

          if (
            fromTime === null &&
            toTime === null
          ) {
            return true;
          }

          const time =
            Date.parse(
              row.sentAt || ""
            );

          if (
            !Number.isFinite(time)
          ) {
            return false;
          }

          if (
            fromTime !== null &&
            time < fromTime
          ) {
            return false;
          }

          if (
            toTime !== null &&
            time > toTime
          ) {
            return false;
          }

          return true;
        }
      );
  }


  function filteredHistory() {

    return applyHistoryFilters(
      allHistory
    );
  }


  function toggleCustomDates() {

    const custom =
      $("dateFilter").value ===
        "custom";

    $("dateFromWrap")
      .classList
      .toggle(
        "hidden",
        !custom
      );

    $("dateToWrap")
      .classList
      .toggle(
        "hidden",
        !custom
      );
  }


  function updateSummary(
    rows
  ) {

    $("totalSignals")
      .textContent =
        rows.length;

    $("activeSignals")
      .textContent =
        rows.filter(
          row =>
            row.status ===
            "ACTIVE"
        ).length;

    const qualities =
      rows
        .map(
          row =>
            Number(
              row.setupQuality
            )
        )
        .filter(
          Number.isFinite
        );

    $("averageQuality")
      .textContent =
        qualities.length
          ? (
              qualities.reduce(
                (a, b) =>
                  a + b,
                0
              ) /
              qualities.length
            ).toFixed(1) +
            "%"
          : "--";

    $("latestSignal")
      .textContent =
        rows.length
          ? formatTime(
              rows[0].sentAt
            )
          : "--";
  }



  function statNumber(
    value,
    suffix = ""
  ) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "--";
    }

    const number =
      Number(value);

    return Number.isFinite(number)
      ? number.toFixed(2) +
          suffix
      : "--";
  }


  function renderStatsTable(
    containerId,
    rows
  ) {

    const container =
      $(containerId);

    container.replaceChildren();

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {

      container.appendChild(
        make(
          "div",
          "stats-empty",
          "Abhi statistics ke liye signal data nahi hai."
        )
      );

      return;
    }


    const table =
      make(
        "table",
        "stats-table"
      );

    const thead =
      document.createElement(
        "thead"
      );

    const headRow =
      document.createElement(
        "tr"
      );

    [
      "Name",
      "Signals",
      "Active",
      "T1",
      "T2",
      "SL",
      "Avg Max R"
    ].forEach(
      label => {

        const th =
          document.createElement(
            "th"
          );

        th.textContent =
          label;

        headRow.appendChild(
          th
        );
      }
    );

    thead.appendChild(
      headRow
    );


    const tbody =
      document.createElement(
        "tbody"
      );

    rows.forEach(
      row => {

        const tr =
          document.createElement(
            "tr"
          );

        [
          row.name,
          row.total,
          row.active,
          row.t1Touched,
          row.t2Hit,
          row.slHit,
          statNumber(
            row.averageMaxR,
            "R"
          )
        ].forEach(
          value => {

            const td =
              document.createElement(
                "td"
              );

            td.textContent =
              value;

            tr.appendChild(
              td
            );
          }
        );

        tbody.appendChild(
          tr
        );
      }
    );

    table.append(
      thead,
      tbody
    );

    container.appendChild(
      table
    );
  }


  function renderLifetimeStats(
    stats
  ) {

    const summary =
      stats?.summary || {};

    $("statsTotal").textContent =
      summary.total || 0;

    $("statsActive").textContent =
      summary.active || 0;

    $("statsT1").textContent =
      summary.t1Touched || 0;

    $("statsT2").textContent =
      summary.t2Hit || 0;

    $("statsSL").textContent =
      summary.slHit || 0;

    $("statsInvalidated").textContent =
      summary.invalidated || 0;

    $("statsStyleChanged").textContent =
      summary.styleChanged || 0;

    $("statsAmbiguous").textContent =
      summary.ambiguous || 0;

    $("statsAverageMaxR").textContent =
      statNumber(
        summary.averageMaxR,
        "R"
      );

    $("statsAverageOutcomeR").textContent =
      statNumber(summary.averageOutcomeR, "R");

    const recordedCountElement = $("statsRecordedOutcomeCount");
    if (recordedCountElement) {
      recordedCountElement.textContent =
        Number.isInteger(summary.recordedOutcomeCount)
          ? summary.recordedOutcomeCount + " of " +
            summary.total + " SIGNALS HAVE A RECORDED R"
          : "Recorded result count unavailable";
    }

    $("statsAverageQuality").textContent =
      statNumber(
        summary.averageSetupQuality,
        "%"
      );

  }


  async function loadStatistics() {

    try {

      const response =
        await fetch(
          "/api/signal-history/stats",
          {
            cache:
              "no-store"
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.error ||
          "Statistics request failed"
        );
      }

      renderLifetimeStats(
        data.stats
      );

    } catch (error) {

      console.error(
        "Statistics load failed:",
        error
      );
    }
  }


  function render() {

    const rows =
      filteredHistory();

    updateSummary(
      rows
    );

    const list =
      $("historyList");

    list.replaceChildren();

    if (
      rows.length === 0
    ) {

      list.appendChild(
        make(
          "div",
          "empty-state",
          "Is filter mein abhi koi saved signal nahi hai."
        )
      );

      return;
    }

    rows.forEach(
      row =>
        list.appendChild(
          renderCard(
            row
          )
        )
    );
  }


  function populatePairs() {

    const select =
      $("pairFilter");

    const current =
      select.value;

    const pairs =
      [
        ...new Set(
          allHistory
            .map(
              row =>
                row.symbol
            )
            .filter(Boolean)
        )
      ]
        .sort();

    select
      .querySelectorAll(
        "option:not(:first-child)"
      )
      .forEach(
        option =>
          option.remove()
      );

    pairs.forEach(
      pair => {

        const option =
          document.createElement(
            "option"
          );

        option.value =
          pair;

        option.textContent =
          pair;

        select.appendChild(
          option
        );
      }
    );

    if (
      pairs.includes(
        current
      )
    ) {
      select.value =
        current;
    }
  }


  async function loadHistory() {

    $("historyConnection")
      .textContent =
        "Loading…";

    try {

      const response =
        await fetch(
          "/api/signal-history?limit=500",
          {
            cache:
              "no-store"
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.ok
      ) {

        throw new Error(
          data.error ||
          "History request failed"
        );
      }

      allHistory =
        Array.isArray(
          data.history
        )
          ? data.history
          : [];

      populatePairs();
      render();

      await loadStatistics();

      $("historyConnection")
        .textContent =
          "LIVE HISTORY";

    } catch (
      error
    ) {

      $("historyConnection")
        .textContent =
          "ERROR";

      const list =
        $("historyList");

      list.replaceChildren(
        make(
          "div",
          "empty-state",
          "History load nahi hui: " +
            error.message
        )
      );
    }
  }


  [
    "pairFilter",
    "styleFilter",
    "statusFilter",
    "outcomeFilter",
    "directionFilter",
    "qualityFilter",
    "dateFilter",
    "dateFrom",
    "dateTo"
  ]
    .forEach(
      id =>
        $(id)
          .addEventListener(
            "change",
            () => {

              if (
                id === "dateFilter"
              ) {
                toggleCustomDates();
              }

              render();
            }
          )
    );


  toggleCustomDates();



  // Expand/collapse the LIFETIME STATISTICS and Filters panels.
  document.querySelectorAll(".history-section-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("aria-controls");
      const content = document.getElementById(targetId);
      if (!content) return;

      const willExpand = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(willExpand));
      content.classList.toggle("history-section-collapsed", !willExpand);
      button.textContent = willExpand ? "▲" : "▼";

      const sectionName = targetId === "lifetimeStatsContent"
        ? "LIFETIME STATISTICS"
        : "Filters";
      button.setAttribute(
        "aria-label",
        `${willExpand ? "Collapse" : "Expand"} ${sectionName}`
      );
    });
  });

  // Mobile pull-to-refresh: reload history only when at page top.
  let pullStartY = 0;
  let pullStartX = 0;
  let pullTracking = false;
  let pullRefreshing = false;

  document.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) return;
    pullTracking = window.scrollY <= 2;
    pullStartY = event.touches[0].clientY;
    pullStartX = event.touches[0].clientX;
  }, { passive: true });

  document.addEventListener("touchend", event => {
    if (!pullTracking || pullRefreshing || event.changedTouches.length !== 1) {
      pullTracking = false;
      return;
    }

    const deltaY = event.changedTouches[0].clientY - pullStartY;
    const deltaX = Math.abs(event.changedTouches[0].clientX - pullStartX);
    pullTracking = false;

    if (deltaY < 90 || deltaX > deltaY * 0.7 || window.scrollY > 2) return;

    pullRefreshing = true;
    Promise.resolve(loadHistory()).finally(() => {
      pullRefreshing = false;
    });
  }, { passive: true });

  loadHistory();

  setInterval(
    loadHistory,
    30 * 1000
  );

})();
