class MultiTimeframeEngine {

  analyze(
    dailyCandles,
    fourHourCandles,
    oneHourCandles,
    fifteenMinuteCandles,
    mode = "intraday"
  ) {

    const r = {
      mode,

      daily:
        null,

      fourHour:
        null,

      oneHour:
        null,

      fifteenMinute:
        null,

      higherTimeframeBias:
        "NEUTRAL / UNRESOLVED",

      alignment:
        "MIXED",

      lowerTimeframeState:
        "UNRESOLVED",

      executionState:
        "WAIT — CONTEXT INCOMPLETE",

      confidence:
        "WAIT",

      bullishScore:
        0,

      bearishScore:
        0,

      evidence:
        ""
    };

    r.daily =
      this.analyzeFrame(
        "1D",
        dailyCandles
      );

    r.fourHour =
      this.analyzeFrame(
        "4H",
        fourHourCandles
      );

    r.oneHour =
      this.analyzeFrame(
        "1H",
        oneHourCandles
      );

    r.fifteenMinute =
      this.analyzeFrame(
        "15m",
        fifteenMinuteCandles
      );

    this.calculateWeightedScores(
      r
    );

    this.determineHigherTimeframeBias(
      r
    );

    this.determineLowerTimeframeState(
      r
    );

    this.determineAlignment(
      r
    );

    this.determineExecutionState(
      r
    );

    this.determineConfidence(
      r
    );

    r.evidence =
      this.buildEvidence(
        r
      );

    return r;
  }


  analyzeFrame(
    timeframe,
    candles
  ) {

    const frame = {
      timeframe,

      direction:
        "NEUTRAL / MIXED",

      structure:
        "UNKNOWN",

      structureEvent:
        "NONE",

      momentum:
        "UNKNOWN",

      smcContext:
        "UNKNOWN",

      bullishEvidence:
        0,

      bearishEvidence:
        0,

      quality:
        "LOW"
    };

    const structureEngine =
      new MarketStructureEngine();

    const structure =
      structureEngine.analyze(
        candles
      );

    const priceEngine =
      new PriceActionEngine();

    const priceAction =
      priceEngine.analyze(
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

    frame.structure =
      structure.trend;

    frame.structureEvent =
      structure.lastEvent;

    frame.momentum =
      priceAction.momentum;

    frame.smcContext =
      smc.context;

    let bull = 0;
    let bear = 0;

    if (
      structure.trend ===
      "BULLISH"
    ) {

      bull += 5;

    } else if (
      structure.trend ===
      "BEARISH"
    ) {

      bear += 5;
    }

    if (
      structure.lastEvent
        .includes(
          "BULLISH BOS"
        )
    ) {

      bull += 3;

    } else if (
      structure.lastEvent
        .includes(
          "BEARISH BOS"
        )
    ) {

      bear += 3;

    } else if (
      structure.lastEvent
        .includes(
          "BULLISH CHoCH"
        )
    ) {

      bull += 2;

    } else if (
      structure.lastEvent
        .includes(
          "BEARISH CHoCH"
        )
    ) {

      bear += 2;
    }

    if (
      priceAction.momentum
        .includes(
          "BULLISH"
        )
    ) {

      bull += 2;

    } else if (
      priceAction.momentum
        .includes(
          "BEARISH"
        )
    ) {

      bear += 2;
    }

    if (
      smc.bullishScore >=
      smc.bearishScore + 3
    ) {

      bull += 3;

    } else if (
      smc.bearishScore >=
      smc.bullishScore + 3
    ) {

      bear += 3;
    }

    frame.bullishEvidence =
      bull;

    frame.bearishEvidence =
      bear;

    const difference =
      Math.abs(
        bull -
        bear
      );

    if (
      bull >=
      bear + 4
    ) {

      frame.direction =
        "BULLISH";

    } else if (
      bear >=
      bull + 4
    ) {

      frame.direction =
        "BEARISH";

    } else {

      frame.direction =
        "NEUTRAL / MIXED";
    }

    if (
      difference >= 7
    ) {

      frame.quality =
        "HIGH";

    } else if (
      difference >= 4
    ) {

      frame.quality =
        "MEDIUM";

    } else {

      frame.quality =
        "LOW";
    }

    return frame;
  }


  calculateWeightedScores(
    r
  ) {

    r.bullishScore = 0;
    r.bearishScore = 0;

    if (r.mode === "swing") {

      this.addFrameScore(r, r.daily, 4);
      this.addFrameScore(r, r.fourHour, 3);
      this.addFrameScore(r, r.oneHour, 2);

      return;
    }

    if (r.mode === "scalping") {

      this.addFrameScore(r, r.fourHour, 1);
      this.addFrameScore(r, r.oneHour, 4);
      this.addFrameScore(r, r.fifteenMinute, 3);

      return;
    }

    this.addFrameScore(r, r.fourHour, 4);
    this.addFrameScore(r, r.oneHour, 3);
    this.addFrameScore(r, r.fifteenMinute, 2);
  }

  addFrameScore(
    r,
    frame,
    weight
  ) {

    r.bullishScore +=
      frame.bullishEvidence *
      weight;

    r.bearishScore +=
      frame.bearishEvidence *
      weight;
  }


  structureBullish(f) {

    return (
      f.structure ===
      "BULLISH"
    );
  }


  structureBearish(f) {

    return (
      f.structure ===
      "BEARISH"
    );
  }


  determineHigherTimeframeBias(
    r
  ) {

    const dailyBull =
      this.structureBullish(
        r.daily
      );

    const dailyBear =
      this.structureBearish(
        r.daily
      );

    const h4Bull =
      this.structureBullish(
        r.fourHour
      );

    const h4Bear =
      this.structureBearish(
        r.fourHour
      );

    if (
      dailyBull &&
      h4Bull
    ) {

      r.higherTimeframeBias =
        "BULLISH HTF BIAS — STRUCTURE CONFIRMED";

      return;
    }

    if (
      dailyBear &&
      h4Bear
    ) {

      r.higherTimeframeBias =
        "BEARISH HTF BIAS — STRUCTURE CONFIRMED";

      return;
    }

    if (
      dailyBull &&
      !h4Bear
    ) {

      r.higherTimeframeBias =
        "BULLISH HTF LEAN — 4H STRUCTURE NOT FULLY CONFIRMED";

      return;
    }

    if (
      dailyBear &&
      !h4Bull
    ) {

      r.higherTimeframeBias =
        "BEARISH HTF LEAN — 4H STRUCTURE NOT FULLY CONFIRMED";

      return;
    }

    r.higherTimeframeBias =
      "HTF STRUCTURE CONFLICT / NEUTRAL";
  }


  determineLowerTimeframeState(
    r
  ) {

    const bullishHTF =
      this.structureBullish(
        r.daily
      ) &&
      this.structureBullish(
        r.fourHour
      );

    const bearishHTF =
      this.structureBearish(
        r.daily
      ) &&
      this.structureBearish(
        r.fourHour
      );

    if (bullishHTF) {

      if (
        this.structureBearish(
          r.oneHour
        )
      ) {

        if (
          r.oneHour
            .structureEvent
            .includes(
              "BEARISH BOS"
            )
        ) {

          r.lowerTimeframeState =
            "POSSIBLE BEARISH REVERSAL — 1H STRUCTURE BROKE";

        } else {

          r.lowerTimeframeState =
            "BULLISH HTF WITH 1H PULLBACK";
        }

        return;
      }

      if (
        this.structureBullish(
          r.oneHour
        )
      ) {

        if (
          this.structureBullish(
            r.fifteenMinute
          )
        ) {

          r.lowerTimeframeState =
            "BULLISH CONTINUATION CONFIRMING";

        } else if (
          this.structureBearish(
            r.fifteenMinute
          )
        ) {

          r.lowerTimeframeState =
            "15m PULLBACK INSIDE BULLISH STRUCTURE";

        } else {

          r.lowerTimeframeState =
            "15m EXECUTION STRUCTURE UNCONFIRMED";
        }

        return;
      }

      r.lowerTimeframeState =
        "1H STRUCTURE UNCONFIRMED";

      return;
    }

    if (bearishHTF) {

      if (
        this.structureBullish(
          r.oneHour
        )
      ) {

        if (
          r.oneHour
            .structureEvent
            .includes(
              "BULLISH BOS"
            )
        ) {

          r.lowerTimeframeState =
            "POSSIBLE BULLISH REVERSAL — 1H STRUCTURE BROKE";

        } else {

          r.lowerTimeframeState =
            "BEARISH HTF WITH 1H PULLBACK";
        }

        return;
      }

      if (
        this.structureBearish(
          r.oneHour
        )
      ) {

        if (
          this.structureBearish(
            r.fifteenMinute
          )
        ) {

          r.lowerTimeframeState =
            "BEARISH CONTINUATION CONFIRMING";

        } else if (
          this.structureBullish(
            r.fifteenMinute
          )
        ) {

          r.lowerTimeframeState =
            "15m PULLBACK INSIDE BEARISH STRUCTURE";

        } else {

          r.lowerTimeframeState =
            "15m EXECUTION STRUCTURE UNCONFIRMED";
        }

        return;
      }

      r.lowerTimeframeState =
        "1H STRUCTURE UNCONFIRMED";

      return;
    }

    r.lowerTimeframeState =
      "NO CLEAN HTF DIRECTION";
  }


  determineAlignment(r) {

    if (
      this.structureBullish(
        r.daily
      ) &&
      this.structureBullish(
        r.fourHour
      ) &&
      this.structureBullish(
        r.oneHour
      ) &&
      this.structureBullish(
        r.fifteenMinute
      )
    ) {

      r.alignment =
        "FULL BULLISH STRUCTURE ALIGNMENT";

      return;
    }

    if (
      this.structureBearish(
        r.daily
      ) &&
      this.structureBearish(
        r.fourHour
      ) &&
      this.structureBearish(
        r.oneHour
      ) &&
      this.structureBearish(
        r.fifteenMinute
      )
    ) {

      r.alignment =
        "FULL BEARISH STRUCTURE ALIGNMENT";

      return;
    }

    if (
      this.structureBullish(
        r.daily
      ) &&
      this.structureBullish(
        r.fourHour
      )
    ) {

      r.alignment =
        "BULLISH HTF — LOWER TIMEFRAMES NOT FULLY ALIGNED";

      return;
    }

    if (
      this.structureBearish(
        r.daily
      ) &&
      this.structureBearish(
        r.fourHour
      )
    ) {

      r.alignment =
        "BEARISH HTF — LOWER TIMEFRAMES NOT FULLY ALIGNED";

      return;
    }

    if (
      this.structureBullish(
        r.daily
      ) &&
      !this.structureBearish(
        r.fourHour
      )
    ) {

      r.alignment =
        "DAILY BULLISH — 4H CONFIRMATION INCOMPLETE";

      return;
    }

    if (
      this.structureBearish(
        r.daily
      ) &&
      !this.structureBullish(
        r.fourHour
      )
    ) {

      r.alignment =
        "DAILY BEARISH — 4H CONFIRMATION INCOMPLETE";

      return;
    }

    r.alignment =
      "TIMEFRAME STRUCTURE CONFLICT";
  }


  determineExecutionState(
    r
  ) {

    const aligned =
      (frame, bias) =>
        bias === "BULLISH"
          ? this.structureBullish(frame)
          : this.structureBearish(frame);

    const opposite =
      (frame, bias) =>
        bias === "BULLISH"
          ? this.structureBearish(frame)
          : this.structureBullish(frame);

    const momentumAligned =
      (frame, bias) =>
        frame.momentum.includes(bias);


    /* SCALPING */

    if (r.mode === "scalping") {

      let bias = null;

      if (this.structureBullish(r.oneHour)) {

        bias = "BULLISH";

      } else if (
        this.structureBearish(r.oneHour)
      ) {

        bias = "BEARISH";
      }


      if (!bias) {

        r.executionState =
          "WAIT — 1H CONTEXT NOT DIRECTIONAL";

        return;
      }


      /*
       * Scalping failure priority:
       * 1. Execution structure
       * 2. Execution momentum
       * 3. Higher-timeframe safety guard
       *
       * This does not loosen trade rules.
       * 4H opposition still blocks the setup.
       */
      if (
        !aligned(
          r.fifteenMinute,
          bias
        )
      ) {

        r.executionState =
          "WAIT — 15m STRUCTURE NOT " +
          bias;

        return;
      }


      if (
        !momentumAligned(
          r.fifteenMinute,
          bias
        )
      ) {

        r.executionState =
          "WAIT — 15m MOMENTUM NOT " +
          bias;

        return;
      }


      if (
        opposite(
          r.fourHour,
          bias
        )
      ) {

        r.executionState =
          "WAIT — 4H STRUCTURE OPPOSES " +
          bias +
          " SCALPING BIAS";

        return;
      }


      r.executionState =
        bias +
        " CONDITIONS ALIGNED";

      return;
    }


    /* SWING */

    if (r.mode === "swing") {

      let bias = null;

      if (this.structureBullish(r.daily)) {

        bias = "BULLISH";

      } else if (
        this.structureBearish(r.daily)
      ) {

        bias = "BEARISH";
      }


      if (!bias) {

        r.executionState =
          "WAIT — DAILY STRUCTURE NOT DIRECTIONAL";

        return;
      }


      if (
        !aligned(
          r.fourHour,
          bias
        )
      ) {

        r.executionState =
          "WAIT — 4H STRUCTURE NOT " +
          bias;

        return;
      }


      if (
        !aligned(
          r.oneHour,
          bias
        )
      ) {

        r.executionState =
          "WAIT — 1H STRUCTURE NOT " +
          bias;

        return;
      }


      if (
        !momentumAligned(
          r.oneHour,
          bias
        )
      ) {

        r.executionState =
          "WAIT — 1H MOMENTUM NOT " +
          bias;

        return;
      }


      r.executionState =
        bias +
        " CONDITIONS ALIGNED";

      return;
    }


    /* INTRADAY */

    let bias = null;

    if (
      this.structureBullish(
        r.fourHour
      )
    ) {

      bias = "BULLISH";

    } else if (
      this.structureBearish(
        r.fourHour
      )
    ) {

      bias = "BEARISH";
    }


    if (!bias) {

      r.executionState =
        "WAIT — 4H BIAS NOT DIRECTIONAL";

      return;
    }


    if (
      !aligned(
        r.oneHour,
        bias
      )
    ) {

      r.executionState =
        "WAIT — 1H STRUCTURE NOT " +
        bias;

      return;
    }


    if (
      !aligned(
        r.fifteenMinute,
        bias
      )
    ) {

      r.executionState =
        "WAIT — 15m STRUCTURE NOT " +
        bias;

      return;
    }


    if (
      !momentumAligned(
        r.fifteenMinute,
        bias
      )
    ) {

      r.executionState =
        "WAIT — 15m MOMENTUM NOT " +
        bias;

      return;
    }


    r.executionState =
      bias +
      " CONDITIONS ALIGNED";
  }

  determineConfidence(r) {

    if (
      r.executionState
        .startsWith("WAIT")
    ) {

      r.confidence =
        "WAIT";

      return;
    }


    const difference =
      Math.abs(
        r.bullishScore -
        r.bearishScore
      );


    let relevantFrames;


    if (
      r.mode === "swing"
    ) {

      relevantFrames = [
        r.daily,
        r.fourHour,
        r.oneHour
      ];

    } else if (
      r.mode === "scalping"
    ) {

      relevantFrames = [
        r.oneHour,
        r.fifteenMinute
      ];

    } else {

      relevantFrames = [
        r.fourHour,
        r.oneHour,
        r.fifteenMinute
      ];
    }


    const allHighQuality =
      relevantFrames.every(
        frame =>
          frame.quality !==
            "LOW"
      );


    if (
      difference >= 40 &&
      allHighQuality
    ) {

      r.confidence =
        "STRONG";

    } else if (
      difference >= 20
    ) {

      r.confidence =
        "MEDIUM";

    } else {

      r.confidence =
        "WEAK";
    }
  }

  buildEvidence(r) {

    return (
      `Higher-Timeframe Bias (1D / 4H): ${r.higherTimeframeBias}\n` +
      `Overall Structure Alignment (1D / 4H / 1H / 15m): ${r.alignment}\n` +
      `Lower-TF State: ${r.lowerTimeframeState}\n` +
      `Analysis State: ${r.executionState}\n` +
      `Confidence: ${r.confidence}\n` +
      `Weighted Bull: ${r.bullishScore}   Bear: ${r.bearishScore}`
    );
  }
}

window.MultiTimeframeEngine =
  MultiTimeframeEngine;
