class ReasoningEngine {

  analyze(
    structure,
    priceAction,
    smc,
    mtf,
    risk
  ) {

    const r = {
      finalBias:
        "NEUTRAL / UNRESOLVED",

      finalState:
        "WAIT",

      confidence:
        "UNCONFIRMED",

      thesis:
        "Market context is not yet clear enough.",

      supportingEvidence:
        "• No strong supporting evidence",

      conflictingEvidence:
        "• No major conflict detected",

      missingConfirmation:
        "None identified",

      nextCondition:
        "Wait for clearer structure.",

      invalidationNarrative:
        "No valid invalidation level yet.",

      riskNarrative:
        "Risk scenario incomplete."
    };


    this.determineBias(
      structure,
      mtf,
      risk,
      r
    );


    r.finalState =
      risk.decision;


    this.determineConfidence(
      mtf,
      risk,
      r
    );


    r.supportingEvidence =
      this.buildSupportingEvidence(
        structure,
        priceAction,
        smc,
        mtf,
        risk,
        r
      );


    r.conflictingEvidence =
      this.buildConflictingEvidence(
        structure,
        priceAction,
        smc,
        mtf,
        risk,
        r
      );


    r.missingConfirmation =
      this.determineMissingConfirmation(
        mtf,
        risk
      );


    r.nextCondition =
      this.determineNextCondition(
        mtf,
        risk,
        r
      );


    r.invalidationNarrative =
      this.buildInvalidation(
        risk
      );


    r.riskNarrative =
      this.buildRiskNarrative(
        risk
      );


    r.thesis =
      this.buildThesis(
        structure,
        priceAction,
        smc,
        mtf,
        risk,
        r
      );


    return r;
  }


  determineBias(
    structure,
    mtf,
    risk,
    r
  ) {

    const executionState =
      mtf.executionState || "";

    /*
     * Swing mode must not inherit a directional
     * final bias when Daily structure itself
     * has no confirmed direction.
     */
    if (
      mtf.mode === "swing" &&
      executionState.includes(
        "DAILY STRUCTURE NOT DIRECTIONAL"
      )
    ) {

      r.finalBias =
        "NEUTRAL / CONFLICTED";

      return;
    }

    /*
     * Keep the final thesis synchronized
     * with the Risk Engine directional
     * context instead of independently
     * overriding it with broad HTF bias.
     */
    if (
      risk.directionalContext
        .startsWith(
          "BULLISH"
        )
    ) {

      r.finalBias =
        "BULLISH";

      return;
    }


    if (
      risk.directionalContext
        .startsWith(
          "BEARISH"
        )
    ) {

      r.finalBias =
        "BEARISH";

      return;
    }


    /*
     * Style-aware fallback.
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

      r.finalBias =
        "BULLISH";

      return;
    }


    if (
      anchorStructure ===
        "BEARISH"
    ) {

      r.finalBias =
        "BEARISH";

      return;
    }


    r.finalBias =
      "NEUTRAL / CONFLICTED";
  }

  determineConfidence(
    mtf,
    risk,
    r
  ) {

    if (
      risk.decision ===
      "WAIT"
    ) {

      r.confidence =
        "UNCONFIRMED";

      return;
    }


    if (
      risk.decision ===
      "SKIP"
    ) {

      r.confidence =
        "LOW / UNFAVORABLE";

      return;
    }


    if (
      mtf.confidence ===
        "STRONG" &&
      risk.quality ===
        "HIGH"
    ) {

      r.confidence =
        "STRONG";

    } else if (
      mtf.confidence ===
        "MEDIUM" ||
      risk.quality ===
        "MEDIUM"
    ) {

      r.confidence =
        "MEDIUM";

    } else {

      r.confidence =
        "WEAK";
    }
  }


  buildSupportingEvidence(
    structure,
    priceAction,
    smc,
    mtf,
    risk,
    r
  ) {

    const lines = [];

    const bullish =
      r.finalBias
        .includes(
          "BULLISH"
        );

    const bearish =
      r.finalBias
        .includes(
          "BEARISH"
        );

    if (
      bullish &&
      mtf.higherTimeframeBias
        .includes(
          "BULLISH"
        )
    ) {

      this.addLine(
        lines,
        "Higher-timeframe bias favors buyers"
      );
    }


    if (
      bearish &&
      mtf.higherTimeframeBias
        .includes(
          "BEARISH"
        )
    ) {

      this.addLine(
        lines,
        "Higher-timeframe bias favors sellers"
      );
    }


    if (
      bullish &&
      structure.trend ===
        "BULLISH"
    ) {

      this.addLine(
        lines,
        "Market structure is bullish"
      );
    }


    if (
      bearish &&
      structure.trend ===
        "BEARISH"
    ) {

      this.addLine(
        lines,
        "Market structure is bearish"
      );
    }


    if (
      bullish &&
      structure.lastEvent
        .includes(
          "BULLISH BOS"
        )
    ) {

      this.addLine(
        lines,
        "Bullish BOS is present"
      );
    }


    if (
      bearish &&
      structure.lastEvent
        .includes(
          "BEARISH BOS"
        )
    ) {

      this.addLine(
        lines,
        "Bearish BOS is present"
      );
    }


    if (
      bullish &&
      priceAction.momentum
        .includes(
          "BULLISH"
        )
    ) {

      this.addLine(
        lines,
        "Recent momentum favors buyers"
      );
    }


    if (
      bearish &&
      priceAction.momentum
        .includes(
          "BEARISH"
        )
    ) {

      this.addLine(
        lines,
        "Recent momentum favors sellers"
      );
    }


    if (
      bullish &&
      smc.bullishScore >
        smc.bearishScore
    ) {

      this.addLine(
        lines,
        "SMC evidence leans bullish"
      );
    }


    if (
      bearish &&
      smc.bearishScore >
        smc.bullishScore
    ) {

      this.addLine(
        lines,
        "SMC evidence leans bearish"
      );
    }


    if (
      bullish &&
      smc.fvg
        .includes(
          "BULLISH"
        )
    ) {

      this.addLine(
        lines,
        "Active bullish FVG is detected"
      );
    }


    if (
      bearish &&
      smc.fvg
        .includes(
          "BEARISH"
        )
    ) {

      this.addLine(
        lines,
        "Active bearish FVG is detected"
      );
    }


    if (
      !mtf.executionState
        .startsWith(
          "WAIT"
        )
    ) {

      this.addLine(
        lines,
        "Execution-timeframe conditions are aligned"
      );
    }


    if (
      risk.decision ===
        "TRADE-CANDIDATE" &&
      Number.isFinite(
        risk.riskReward
      ) &&
      risk.riskReward >=
        2
    ) {

      this.addLine(
        lines,
        "Risk/reward scenario is at least 1:2"
      );
    }


    if (
      lines.length === 0
    ) {

      return "• No confirmed supporting evidence for the current directional thesis";
    }


    return lines.join(
      "\n"
    );
  }


  buildConflictingEvidence(
    structure,
    priceAction,
    smc,
    mtf,
    risk,
    r
  ) {

    const lines = [];

    const bullish =
      r.finalBias
        .includes(
          "BULLISH"
        );

    const bearish =
      r.finalBias
        .includes(
          "BEARISH"
        );


    const executionFrame =
      mtf.mode === "swing"
        ? mtf.oneHour
        : mtf.fifteenMinute;

    const executionLabel =
      mtf.mode === "swing"
        ? "1H"
        : "15m";


    if (
      mtf.fourHour.structure
        .includes(
          "SIDEWAYS"
        ) ||
      mtf.fourHour.structure
        .includes(
          "MIXED"
        )
    ) {

      this.addLine(
        lines,
        "4H structure is not directional"
      );
    }


    if (
      bullish &&
      mtf.fourHour
        .structureEvent
        .includes(
          "BEARISH CHoCH"
        )
    ) {

      this.addLine(
        lines,
        "4H bearish CHoCH warns that the bullish structure is under pressure"
      );
    }


    if (
      bearish &&
      mtf.fourHour
        .structureEvent
        .includes(
          "BULLISH CHoCH"
        )
    ) {

      this.addLine(
        lines,
        "4H bullish CHoCH warns that the bearish structure is under pressure"
      );
    }


    if (
      bullish &&
      mtf.fourHour.structure ===
        "BEARISH"
    ) {

      this.addLine(
        lines,
        "4H structure currently opposes the bullish directional bias"
      );
    }


    if (
      bearish &&
      mtf.fourHour.structure ===
        "BULLISH"
    ) {

      this.addLine(
        lines,
        "4H structure currently opposes the bearish directional bias"
      );
    }


    if (
      executionFrame.direction
        .includes(
          "NEUTRAL"
        )
    ) {

      this.addLine(
        lines,
        executionLabel +
          " execution direction is unresolved"
      );
    }


    if (
      bullish &&
      executionFrame
        .structureEvent
        .includes(
          "BEARISH CHoCH"
        )
    ) {

      this.addLine(
        lines,
        executionLabel +
          " bearish CHoCH shows reversal pressure against the bullish bias"
      );
    }


    if (
      bearish &&
      executionFrame
        .structureEvent
        .includes(
          "BULLISH CHoCH"
        )
    ) {

      this.addLine(
        lines,
        executionLabel +
          " bullish CHoCH shows reversal pressure against the bearish bias"
      );
    }


    if (
      bullish &&
      executionFrame
        .structure ===
        "BEARISH"
    ) {

      this.addLine(
        lines,
        executionLabel +
          " structure currently opposes bullish bias"
      );
    }


    if (
      bearish &&
      executionFrame
        .structure ===
        "BULLISH"
    ) {

      this.addLine(
        lines,
        executionLabel +
          " structure currently opposes bearish bias"
      );
    }


    if (
      priceAction.candleStrength
        .includes(
          "WEAK"
        )
    ) {

      this.addLine(
        lines,
        "Latest candle shows weak/indecisive body"
      );
    }


    if (
      smc.liquiditySweep
        .includes(
          "NO CONFIRMED"
        )
    ) {

      this.addLine(
        lines,
        "No confirmed liquidity sweep"
      );
    }


    if (
      smc.displacement
        .includes(
          "NO STRONG"
        )
    ) {

      this.addLine(
        lines,
        "No strong displacement confirmation"
      );
    }


    if (
      smc.orderBlock
        .includes(
          "NO CONFIRMED"
        )
    ) {

      this.addLine(
        lines,
        "No validated order block"
      );
    }


    if (
      bullish &&
      smc.premiumDiscount ===
        "PREMIUM"
    ) {

      this.addLine(
        lines,
        "Price is in premium within the current dealing range"
      );
    }


    if (
      bearish &&
      smc.premiumDiscount ===
        "DISCOUNT"
    ) {

      this.addLine(
        lines,
        "Price is in discount within the current dealing range"
      );
    }


    if (
      risk.volatility ===
      "HIGH"
    ) {

      this.addLine(
        lines,
        "Volatility is high"
      );
    }


    if (
      lines.length === 0
    ) {

      return "• No major contradiction detected";
    }


    return lines.join(
      "\n"
    );
  }


  determineMissingConfirmation(
    mtf,
    risk
  ) {

    const state =
      mtf.executionState || "";

    if (
      state.includes(
        "DAILY STRUCTURE NOT DIRECTIONAL"
      )
    ) {
      return "A clear Daily directional structure";
    }

    if (
      state.includes(
        "4H BIAS NOT DIRECTIONAL"
      )
    ) {
      return "A clear 4H directional bias";
    }

    if (
      state.includes(
        "4H STRUCTURE OPPOSES"
      )
    ) {
      return "4H structure that no longer opposes the execution bias";
    }

    if (
      state.includes(
        "4H STRUCTURE NOT"
      )
    ) {
      return "4H structure confirmation";
    }

    if (
      state.includes(
        "1H CONTEXT NOT DIRECTIONAL"
      )
    ) {
      return "A clear 1H directional context";
    }

    if (
      state.includes(
        "1H STRUCTURE NOT"
      )
    ) {
      return "1H structure confirmation";
    }

    if (
      state.includes(
        "1H MOMENTUM NOT"
      )
    ) {
      return "1H momentum confirmation";
    }

    if (
      state.includes(
        "15m STRUCTURE NOT"
      )
    ) {
      return "15m structural confirmation";
    }

    if (
      state.includes(
        "15m MOMENTUM NOT"
      )
    ) {
      return "15m momentum confirmation";
    }

    if (
      risk.decision ===
        "SKIP"
    ) {
      return "A better risk/reward setup";
    }

    if (
      risk.decision ===
        "TRADE-CANDIDATE"
    ) {
      return "No major confirmation missing";
    }

    return "Cleaner structure and execution confirmation";
  }

  determineNextCondition(
    mtf,
    risk,
    r
  ) {

    const state =
      mtf.executionState || "";

    if (
      state.includes(
        "DAILY STRUCTURE NOT DIRECTIONAL"
      )
    ) {
      return "Wait for Daily structure to establish a clear bullish or bearish direction.";
    }

    if (
      state.includes(
        "4H BIAS NOT DIRECTIONAL"
      )
    ) {
      return "Wait for 4H structure to establish a clear intraday directional bias.";
    }

    if (
      state.includes(
        "4H STRUCTURE OPPOSES"
      )
    ) {
      return "Wait until 4H structure stops opposing the scalping direction.";
    }

    if (
      state.includes(
        "4H STRUCTURE NOT BULLISH"
      )
    ) {
      return "Wait for 4H structure to confirm the bullish direction.";
    }

    if (
      state.includes(
        "4H STRUCTURE NOT BEARISH"
      )
    ) {
      return "Wait for 4H structure to confirm the bearish direction.";
    }

    if (
      state.includes(
        "1H CONTEXT NOT DIRECTIONAL"
      )
    ) {
      return "Wait for 1H structure to establish a clear scalping direction.";
    }

    if (
      state.includes(
        "1H STRUCTURE NOT BULLISH"
      )
    ) {
      return "Wait for 1H structure to rebuild bullish confirmation.";
    }

    if (
      state.includes(
        "1H STRUCTURE NOT BEARISH"
      )
    ) {
      return "Wait for 1H structure to rebuild bearish confirmation.";
    }

    if (
      state.includes(
        "1H MOMENTUM NOT"
      )
    ) {
      return "Wait for 1H momentum to agree with the swing structure.";
    }

    if (
      state.includes(
        "15m STRUCTURE NOT BULLISH"
      )
    ) {
      return "Wait for bullish 15m structural confirmation.";
    }

    if (
      state.includes(
        "15m STRUCTURE NOT BEARISH"
      )
    ) {
      return "Wait for bearish 15m structural confirmation.";
    }

    if (
      state.includes(
        "15m MOMENTUM NOT"
      )
    ) {
      return "Wait for 15m momentum to agree with the confirmed structure.";
    }

    if (
      risk.decision ===
        "SKIP"
    ) {
      return "Skip this setup and wait for a cleaner risk/reward opportunity.";
    }

    if (
      risk.decision ===
        "TRADE-CANDIDATE"
    ) {
      return "Selected trading-style conditions are aligned; risk controls still remain mandatory.";
    }

    return "Wait for cleaner structure and confirmation.";
  }

  buildInvalidation(
    risk
  ) {

    if (
      risk.decision !==
      "TRADE-CANDIDATE"
    ) {

      return "No active trade invalidation level until the setup is confirmed.";
    }


    if (
      !Number.isFinite(
        risk.invalidation
      )
    ) {

      return "No reliable invalidation level can be calculated yet.";
    }


    if (
      risk.directionalContext
        .startsWith(
          "BULLISH"
        )
    ) {

      return (
        "Bullish thesis weakens materially below " +
        this.format(
          risk.invalidation
        ) +
        "."
      );
    }


    if (
      risk.directionalContext
        .startsWith(
          "BEARISH"
        )
    ) {

      return (
        "Bearish thesis weakens materially above " +
        this.format(
          risk.invalidation
        ) +
        "."
      );
    }


    return (
      "Reference invalidation: " +
      this.format(
        risk.invalidation
      ) +
      "."
    );
  }


  buildRiskNarrative(
    risk
  ) {

    if (
      risk.decision !==
      "TRADE-CANDIDATE"
    ) {

      return (
        "Setup quality " +
        risk.setupQuality +
        "/100, volatility " +
        risk.volatility +
        ". No active trade risk/reward until confirmation."
      );
    }


    if (
      !Number.isFinite(
        risk.riskReward
      )
    ) {

      return "Risk/reward is not currently measurable.";
    }


    return (
      "Setup quality " +
      risk.setupQuality +
      "/100, volatility " +
      risk.volatility +
      ", R:R 1:" +
      this.format2(
        risk.riskReward
      ) +
      "."
    );
  }


  buildThesis(
    structure,
    priceAction,
    smc,
    mtf,
    risk,
    r
  ) {

    if (
      risk.decision ===
      "WAIT"
    ) {

      if (
        r.finalBias
          .includes(
            "BULLISH"
          )
      ) {

        if (
          mtf.mode === "swing"
        ) {

          return (
            "Daily swing structure currently provides the bullish directional anchor, but the setup is not execution-ready. " +
            (
              mtf.fourHour?.structure === "BEARISH"
                ? "4H structure is bearish and conflicts with that direction. "
                : ""
            ) +
            r.missingConfirmation +
            " is still missing, so the disciplined action is to wait."
          );
        }

        return (
          "The current directional anchor is bullish, but the setup is not execution-ready. " +
          r.missingConfirmation +
          " is still missing, so the disciplined action is to wait."
        );
      }


      if (
        r.finalBias
          .includes(
            "BEARISH"
          )
      ) {

        if (
          mtf.mode === "swing"
        ) {

          return (
            "Daily swing structure currently provides the bearish directional anchor, but the setup is not execution-ready. " +
            (
              mtf.fourHour?.structure === "BULLISH"
                ? "4H structure is bullish and conflicts with that direction. "
                : ""
            ) +
            r.missingConfirmation +
            " is still missing, so the disciplined action is to wait."
          );
        }

        return (
          "The current directional anchor is bearish, but the setup is not execution-ready. " +
          r.missingConfirmation +
          " is still missing, so the disciplined action is to wait."
        );
      }


      return "The evidence is mixed or incomplete. There is not enough alignment to justify an execution-ready setup.";
    }


    if (
      risk.decision ===
      "SKIP"
    ) {

      return "Directional evidence may exist, but the risk profile is unfavorable. The setup should be skipped rather than forced.";
    }


    return "Structure, timeframe conditions for the selected trading style, and risk checks currently form a trade candidate. This does not necessarily mean all four timeframes are aligned. This remains a probabilistic setup, not a guaranteed outcome.";
  }


  addLine(
    lines,
    value
  ) {

    lines.push(
      "• " + value
    );
  }


  format(value) {

    const abs =
      Math.abs(value);

    if (abs < 10) {

      return Number(value)
        .toLocaleString(
          "en-US",
          {
            minimumFractionDigits:
              5,

            maximumFractionDigits:
              5
          }
        );
    }


    if (abs < 100) {

      return Number(value)
        .toLocaleString(
          "en-US",
          {
            minimumFractionDigits:
              4,

            maximumFractionDigits:
              4
          }
        );
    }


    return Number(value)
      .toLocaleString(
        "en-US",
        {
          minimumFractionDigits:
            2,

          maximumFractionDigits:
            2
        }
      );
  }


  format2(value) {

    return Number(value)
      .toFixed(2);
  }
}


window.ReasoningEngine =
  ReasoningEngine;
