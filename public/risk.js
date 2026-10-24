class RiskEngine {

  analyze(
    candles,
    structure,
    priceAction,
    smc,
    mtf
  ) {

    const r = {
      currentPrice:
        NaN,

      atr:
        NaN,

      atrPercent:
        NaN,

      volatility:
        "UNKNOWN",

      directionalContext:
        "NONE",

      entryLow:
        NaN,

      entryHigh:
        NaN,

      entryReference:
        NaN,

      entryStatus:
        "WAIT — NO VALID ENTRY YET",

      invalidation:
        NaN,

      stopLoss:
        NaN,

      riskDistance:
        NaN,

      target1:
        NaN,

      target2:
        NaN,

      rr1:
        NaN,

      rr2:
        NaN,

      riskReward:
        NaN,

      targetLogic:
        "No reliable target yet",

      setupQuality:
        0,

      quality:
        "INCOMPLETE",

      decision:
        "WAIT",

      reason:
        "Context incomplete",

      exitCondition:
        "Wait for a valid directional setup."
    };

    if (
      !candles ||
      candles.length < 20
    ) {

      r.reason =
        "Not enough candles for risk analysis";

      return r;
    }

    r.currentPrice =
      candles[
        candles.length - 1
      ].close;

    r.entryReference =
      r.currentPrice;

    r.atr =
      this.calculateATR(
        candles,
        14
      );

    if (
      r.currentPrice > 0 &&
      Number.isFinite(
        r.atr
      )
    ) {

      r.atrPercent =
        r.atr /
        r.currentPrice *
        100;
    }

    this.classifyVolatility(
      r
    );

    this.determineDirectionalContext(
      structure,
      mtf,
      r
    );

    this.calculateEntryZone(
      r
    );

    this.calculateInvalidation(
      structure,
      r
    );

    this.calculateTargets(
      structure,
      r
    );

    this.calculateSetupQuality(
      structure,
      priceAction,
      smc,
      mtf,
      r
    );

    this.determineDecision(
      mtf,
      r
    );

    this.buildExitCondition(
      r
    );

    return r;
  }


  calculateATR(
    candles,
    period
  ) {

    if (
      candles.length < 2
    ) {
      return NaN;
    }

    const start =
      Math.max(
        1,
        candles.length -
        period
      );

    let total = 0;
    let count = 0;

    for (
      let i = start;
      i < candles.length;
      i++
    ) {

      const current =
        candles[i];

      const previous =
        candles[i - 1];

      const range1 =
        current.high -
        current.low;

      const range2 =
        Math.abs(
          current.high -
          previous.close
        );

      const range3 =
        Math.abs(
          current.low -
          previous.close
        );

      const trueRange =
        Math.max(
          range1,
          range2,
          range3
        );

      total +=
        trueRange;

      count++;
    }

    return count === 0
      ? NaN
      : total / count;
  }


  classifyVolatility(r) {

    if (
      !Number.isFinite(
        r.atrPercent
      )
    ) {

      r.volatility =
        "UNKNOWN";

      return;
    }

    if (
      r.atrPercent <
      0.35
    ) {

      r.volatility =
        "LOW";

    } else if (
      r.atrPercent <
      0.80
    ) {

      r.volatility =
        "NORMAL / MODERATE";

    } else {

      r.volatility =
        "HIGH";
    }
  }


  determineDirectionalContext(
    structure,
    mtf,
    r
  ) {

    const state =
      mtf.executionState || "";


    /*
     * Swing mode must stay neutral when
     * Daily structure has no clean direction.
     * Do not fall back to the 1H execution
     * structure in this case.
     */
    if (
      mtf.mode === "swing" &&
      state.includes(
        "DAILY STRUCTURE NOT DIRECTIONAL"
      )
    ) {

      r.directionalContext =
        "NEUTRAL / CONFLICTED";

      return;
    }


    /*
     * Intraday direction must come from 4H.
     * If 4H has no clean direction, do not
     * fall back to the 15m execution structure.
     */
    if (
      mtf.mode === "intraday" &&
      state.includes(
        "4H BIAS NOT DIRECTIONAL"
      )
    ) {

      r.directionalContext =
        "NEUTRAL / CONFLICTED";

      return;
    }


    /*
     * Fully aligned MTF conditions
     * always have first priority.
     */
    if (
      state.includes(
        "BULLISH CONDITIONS ALIGNED"
      )
    ) {

      r.directionalContext =
        "BULLISH";

      return;
    }


    if (
      state.includes(
        "BEARISH CONDITIONS ALIGNED"
      )
    ) {

      r.directionalContext =
        "BEARISH";

      return;
    }


    /*
     * When confirmation is incomplete,
     * use the directional anchor for
     * the selected trading style.
     *
     * Scalping  -> 1H
     * Intraday  -> 4H
     * Swing     -> Daily
     */
    let anchorStructure =
      "UNKNOWN";


    if (
      mtf.mode === "scalping"
    ) {

      anchorStructure =
        mtf.oneHour?.structure ||
        "UNKNOWN";

    } else if (
      mtf.mode === "swing"
    ) {

      anchorStructure =
        mtf.daily?.structure ||
        "UNKNOWN";

    } else {

      anchorStructure =
        mtf.fourHour?.structure ||
        "UNKNOWN";
    }


    if (
      anchorStructure ===
        "BULLISH"
    ) {

      r.directionalContext =
        "BULLISH — UNCONFIRMED";

      return;
    }


    if (
      anchorStructure ===
        "BEARISH"
    ) {

      r.directionalContext =
        "BEARISH — UNCONFIRMED";

      return;
    }


    /*
     * Final fallback:
     * use execution structure only
     * if the style anchor is unresolved.
     */
    if (
      structure.trend ===
        "BULLISH"
    ) {

      r.directionalContext =
        "BULLISH — UNCONFIRMED";

      return;
    }


    if (
      structure.trend ===
        "BEARISH"
    ) {

      r.directionalContext =
        "BEARISH — UNCONFIRMED";

      return;
    }


    r.directionalContext =
      "NO CLEAN DIRECTION";
  }

  calculateEntryZone(r) {

    if (
      !Number.isFinite(
        r.atr
      )
    ) {
      return;
    }

    if (
      r.directionalContext
        .startsWith(
          "BULLISH"
        )
    ) {

      r.entryLow =
        r.currentPrice -
        r.atr * 0.15;

      r.entryHigh =
        r.currentPrice +
        r.atr * 0.05;

      /*
       * Conservative bullish execution:
       * use the highest price in the entry zone.
       */
      r.entryReference =
        r.entryHigh;

      return;
    }

    if (
      r.directionalContext
        .startsWith(
          "BEARISH"
        )
    ) {

      r.entryLow =
        r.currentPrice -
        r.atr * 0.05;

      r.entryHigh =
        r.currentPrice +
        r.atr * 0.15;

      /*
       * Conservative bearish execution:
       * use the lowest price in the entry zone.
       */
      r.entryReference =
        r.entryLow;
    }
  }


  calculateInvalidation(
    structure,
    r
  ) {

    if (
      !Number.isFinite(r.atr) ||
      r.atr <= 0
    ) {
      return;
    }

    const buffer =
      r.atr * 0.25;

    if (
      r.directionalContext
        .startsWith(
          "BULLISH"
        )
    ) {

      let base =
        NaN;

      if (
        Number.isFinite(
          structure.lastSwingLow
        ) &&
        structure.lastSwingLow <
          r.currentPrice
      ) {

        base =
          structure.lastSwingLow;

      } else if (
        Number.isFinite(
          structure.support
        ) &&
        structure.support <
          r.currentPrice
      ) {

        base =
          structure.support;

      } else {

        base =
          r.currentPrice -
          r.atr * 1.25;
      }

      r.stopLoss =
        base -
        buffer;

      r.invalidation =
        r.stopLoss;

      r.riskDistance =
        r.entryReference -
        r.stopLoss;

      return;
    }

    if (
      r.directionalContext
        .startsWith(
          "BEARISH"
        )
    ) {

      let base =
        NaN;

      if (
        Number.isFinite(
          structure.lastSwingHigh
        ) &&
        structure.lastSwingHigh >
          r.currentPrice
      ) {

        base =
          structure.lastSwingHigh;

      } else if (
        Number.isFinite(
          structure.resistance
        ) &&
        structure.resistance >
          r.currentPrice
      ) {

        base =
          structure.resistance;

      } else {

        base =
          r.currentPrice +
          r.atr * 1.25;
      }

      r.stopLoss =
        base +
        buffer;

      r.invalidation =
        r.stopLoss;

      r.riskDistance =
        r.stopLoss -
        r.entryReference;
    }
  }


  calculateTargets(
    structure,
    r
  ) {

    if (
      !Number.isFinite(
        r.riskDistance
      ) ||
      r.riskDistance <= 0
    ) {

      return;
    }

    if (
      r.directionalContext
        .startsWith(
          "BULLISH"
        )
    ) {

      const projected1 =
        r.entryReference +
        r.riskDistance *
        1.5;

      const projected2 =
        r.entryReference +
        r.riskDistance *
        2.5;

      const resistance =
        Number.isFinite(
          structure.resistance
        ) &&
        structure.resistance >
          r.currentPrice
          ? structure.resistance
          : NaN;

      if (
        Number.isFinite(
          resistance
        ) &&
        resistance <=
          projected1
      ) {

        r.target1 =
          resistance;

        r.target2 =
          NaN;

        r.targetLogic =
          "Nearest resistance caps upside before 1.5R";

      } else if (
        Number.isFinite(
          resistance
        ) &&
        resistance <
          projected2
      ) {

        r.target1 =
          projected1;

        r.target2 =
          resistance;

        r.targetLogic =
          "T1 at 1.5R • T2 at nearest resistance";

      } else {

        r.target1 =
          projected1;

        r.target2 =
          projected2;

        r.targetLogic =
          Number.isFinite(
            resistance
          )
            ? "1.5R / 2.5R targets remain below nearest resistance"
            : "Projected 1.5R / 2.5R targets";
      }

      r.rr1 =
        (
          r.target1 -
          r.entryReference
        ) /
        r.riskDistance;

      if (
        Number.isFinite(
          r.target2
        )
      ) {

        r.rr2 =
          (
            r.target2 -
            r.entryReference
          ) /
          r.riskDistance;
      }

    } else if (
      r.directionalContext
        .startsWith(
          "BEARISH"
        )
    ) {

      const projected1 =
        r.entryReference -
        r.riskDistance *
        1.5;

      const projected2 =
        r.entryReference -
        r.riskDistance *
        2.5;

      const support =
        Number.isFinite(
          structure.support
        ) &&
        structure.support <
          r.currentPrice
          ? structure.support
          : NaN;

      if (
        Number.isFinite(
          support
        ) &&
        support >=
          projected1
      ) {

        r.target1 =
          support;

        r.target2 =
          NaN;

        r.targetLogic =
          "Nearest support caps downside before 1.5R";

      } else if (
        Number.isFinite(
          support
        ) &&
        support >
          projected2
      ) {

        r.target1 =
          projected1;

        r.target2 =
          support;

        r.targetLogic =
          "T1 at 1.5R • T2 at nearest support";

      } else {

        r.target1 =
          projected1;

        r.target2 =
          projected2;

        r.targetLogic =
          Number.isFinite(
            support
          )
            ? "1.5R / 2.5R targets remain above nearest support"
            : "Projected 1.5R / 2.5R targets";
      }

      r.rr1 =
        (
          r.entryReference -
          r.target1
        ) /
        r.riskDistance;

      if (
        Number.isFinite(
          r.target2
        )
      ) {

        r.rr2 =
          (
            r.entryReference -
            r.target2
          ) /
          r.riskDistance;
      }
    }

    if (
      Number.isFinite(
        r.rr2
      )
    ) {

      r.riskReward =
        r.rr2;

    } else {

      r.riskReward =
        r.rr1;
    }
  }


  calculateSetupQuality(
    structure,
    priceAction,
    smc,
    mtf,
    r
  ) {

    let score = 0;

    const bullish =
      r.directionalContext
        .startsWith(
          "BULLISH"
        );

    const bearish =
      r.directionalContext
        .startsWith(
          "BEARISH"
        );

    if (
      mtf.confidence ===
      "STRONG"
    ) {

      score += 30;

    } else if (
      mtf.confidence ===
      "MEDIUM"
    ) {

      score += 22;

    } else if (
      mtf.confidence ===
      "WEAK"
    ) {

      score += 10;
    }

    if (
      bullish &&
      structure.trend ===
        "BULLISH"
    ) {

      score += 15;
    }

    if (
      bearish &&
      structure.trend ===
        "BEARISH"
    ) {

      score += 15;
    }

    if (
      bullish &&
      priceAction.momentum
        .includes(
          "BULLISH"
        )
    ) {

      score += 10;
    }

    if (
      bearish &&
      priceAction.momentum
        .includes(
          "BEARISH"
        )
    ) {

      score += 10;
    }

    const smcAligned =
      (
        bullish &&
        smc.bullishScore >
          smc.bearishScore
      ) ||
      (
        bearish &&
        smc.bearishScore >
          smc.bullishScore
      );

    if (
      smcAligned &&
      smc.confluenceGrade ===
        "STRONG"
    ) {

      score += 20;

    } else if (
      smcAligned &&
      smc.confluenceGrade ===
        "MEDIUM"
    ) {

      score += 12;

    } else if (
      smcAligned &&
      smc.confluenceGrade ===
        "WEAK"
    ) {

      score += 5;
    }

    if (
      Number.isFinite(
        r.riskReward
      )
    ) {

      if (
        r.riskReward >=
        2
      ) {

        score += 20;

      } else if (
        r.riskReward >=
        1.5
      ) {

        score += 10;
      }
    }

    if (
      r.volatility ===
      "HIGH"
    ) {

      score -= 10;
    }

    score =
      Math.max(
        0,
        Math.min(
          100,
          score
        )
      );

    r.setupQuality =
      score;

    if (
      score >= 75
    ) {

      r.quality =
        "HIGH";

    } else if (
      score >= 55
    ) {

      r.quality =
        "MEDIUM";

    } else if (
      score >= 35
    ) {

      r.quality =
        "LOW";

    } else {

      r.quality =
        "INCOMPLETE";
    }
  }


  determineDecision(
    mtf,
    r
  ) {

    // Fail-safe stop-loss validation. Never tighten a structural SL artificially.
    const bullish = r.directionalContext.startsWith("BULLISH");
    const bearish = r.directionalContext.startsWith("BEARISH");

    const validPrices =
      Number.isFinite(r.entryReference) &&
      r.entryReference > 0 &&
      Number.isFinite(r.stopLoss) &&
      r.stopLoss > 0 &&
      Number.isFinite(r.currentPrice) &&
      r.currentPrice > 0;

    const correctSlSide =
      (bullish && r.stopLoss < r.entryReference) ||
      (bearish && r.stopLoss > r.entryReference);

    const calculatedDistance = bullish
      ? r.entryReference - r.stopLoss
      : bearish
        ? r.stopLoss - r.entryReference
        : NaN;

    const validRiskDistance =
      Number.isFinite(r.riskDistance) &&
      r.riskDistance > 0 &&
      Number.isFinite(calculatedDistance) &&
      Math.abs(r.riskDistance - calculatedDistance) <=
        Math.max(1e-10, Math.abs(calculatedDistance) * 1e-8);

    const validAtr =
      Number.isFinite(r.atr) && r.atr > 0;

    let slValidationError = "";

    if (!bullish && !bearish) {
      slValidationError = "No valid trade direction for Stop Loss validation";
    } else if (!validPrices) {
      slValidationError = "Entry or Stop Loss price is invalid";
    } else if (!correctSlSide) {
      slValidationError = "Stop Loss is on the wrong side of entry";
    } else if (!validAtr) {
      slValidationError = "ATR is invalid; Stop Loss distance cannot be validated";
    } else if (!validRiskDistance) {
      slValidationError = "Risk distance is invalid or inconsistent with entry and Stop Loss";
    }

    if (slValidationError) {
      r.decision = "SKIP";
      r.entryStatus = "NO ENTRY — SKIP SETUP";
      r.reason = slValidationError;
      return;
    }


    if (
      mtf.executionState
        .startsWith(
          "WAIT"
        )
    ) {

      r.decision =
        "WAIT";

      r.entryStatus =
        "WAIT — NO VALID ENTRY YET";

      r.reason =
        mtf.executionState;

      return;
    }

    // Fail closed when either target is missing, invalid, or
    // does not extend in the correct direction beyond T1.
    const validTargets =
      Number.isFinite(r.target1) &&
      r.target1 > 0 &&
      Number.isFinite(r.target2) &&
      r.target2 > 0 &&
      (
        (bullish &&
          r.target1 > r.entryReference &&
          r.target2 > r.target1) ||
        (bearish &&
          r.target1 < r.entryReference &&
          r.target2 < r.target1)
      );

    if (!validTargets) {
      r.decision = "SKIP";
      r.entryStatus = "NO ENTRY — SKIP SETUP";
      r.reason =
        "Invalid or unordered target levels; both targets are required";
      return;
    }

    if (
      !Number.isFinite(
        r.rr1
      ) ||
      !Number.isFinite(
        r.rr2
      )
    ) {
      r.decision = "SKIP";
      r.entryStatus = "NO ENTRY — SKIP SETUP";
      r.reason = "Target risk / reward values are invalid";
      return;
    }

    const actualRR1 = bullish
      ? (r.target1 - r.entryReference) / calculatedDistance
      : (r.entryReference - r.target1) / calculatedDistance;

    const actualRR2 = bullish
      ? (r.target2 - r.entryReference) / calculatedDistance
      : (r.entryReference - r.target2) / calculatedDistance;

    if (
      !Number.isFinite(actualRR1) ||
      !Number.isFinite(actualRR2) ||
      actualRR1 < 1.5 - 1e-12 ||
      Math.abs(r.rr1 - actualRR1) > 0.03 ||
      Math.abs(r.rr2 - actualRR2) > 0.03 ||
      !Number.isFinite(r.riskReward) ||
      Math.abs(r.riskReward - actualRR2) > 0.03
    ) {
      r.decision = "SKIP";
      r.entryStatus = "NO ENTRY — SKIP SETUP";
      r.reason =
        "Target levels or reported risk / reward are inconsistent";
      return;
    }

    if (
      !Number.isFinite(
        r.riskReward
      )
    ) {

      r.decision =
        "WAIT";

      r.entryStatus =
        "WAIT — NO VALID ENTRY YET";

      r.reason =
        "Risk / reward cannot be calculated";

      return;
    }

    if (
      r.riskReward <
      1.5
    ) {

      r.decision =
        "SKIP";

      r.entryStatus =
        "NO ENTRY — SKIP SETUP";

      r.reason =
        "Available risk / reward is below 1.5";

      return;
    }

    if (
      r.setupQuality <
      55
    ) {

      r.decision =
        "WAIT";

      r.entryStatus =
        "WAIT — NO VALID ENTRY YET";

      r.reason =
        "Setup quality not strong enough";

      return;
    }

    r.decision =
      "TRADE-CANDIDATE";

    r.entryStatus =
      "VALID TRADE CANDIDATE";

    r.reason =
      "Structure, timeframe alignment and risk conditions passed";
  }


  buildExitCondition(r) {

    if (
      r.directionalContext
        .startsWith(
          "BULLISH"
        )
    ) {

      r.exitCondition =
        "Bullish setup is invalid if price closes below the Stop Loss / invalidation area. Consider T1 as first profit area and T2 only while structure remains bullish.";

      return;
    }

    if (
      r.directionalContext
        .startsWith(
          "BEARISH"
        )
    ) {

      r.exitCondition =
        "Bearish setup is invalid if price closes above the Stop Loss / invalidation area. Consider T1 as first profit area and T2 only while structure remains bearish.";

      return;
    }

    r.exitCondition =
      "No clean directional setup yet.";
  }
}

window.RiskEngine =
  RiskEngine;
