class MarketStructureEngine {

  analyze(candles) {
    const result = {
      trend: "SIDEWAYS",
      structure: "INSUFFICIENT DATA",

      lastSwingHigh: NaN,
      lastSwingLow: NaN,

      higherHighs: 0,
      higherLows: 0,
      lowerHighs: 0,
      lowerLows: 0,

      swings: [],

      support: NaN,
      resistance: NaN,

      lastEvent: "NONE",
      recentBias: "NEUTRAL",

      bullishRecentScore: 0,
      bearishRecentScore: 0
    };

    if (!candles || candles.length < 7) {
      return result;
    }

    result.swings =
      this.detectSwings(
        candles,
        2
      );

    this.classifySwings(
      result.swings,
      result
    );

    this.determineRecentTrend(
      result
    );

    this.calculateSupportResistance(
      candles,
      result
    );

    this.detectStructureEvent(
      candles,
      result
    );

    for (
      let i =
        result.swings.length - 1;
      i >= 0;
      i--
    ) {
      const swing =
        result.swings[i];

      if (
        swing.high &&
        Number.isNaN(
          result.lastSwingHigh
        )
      ) {
        result.lastSwingHigh =
          swing.price;
      }

      if (
        !swing.high &&
        Number.isNaN(
          result.lastSwingLow
        )
      ) {
        result.lastSwingLow =
          swing.price;
      }

      if (
        !Number.isNaN(
          result.lastSwingHigh
        ) &&
        !Number.isNaN(
          result.lastSwingLow
        )
      ) {
        break;
      }
    }

    result.structure =
      this.buildStructureSummary(
        result
      );

    return result;
  }

  detectSwings(
    candles,
    strength
  ) {
    const swings = [];

    for (
      let i = strength;
      i <
      candles.length -
        strength;
      i++
    ) {
      const current =
        candles[i];

      let swingHigh = true;
      let swingLow = true;

      for (
        let j = 1;
        j <= strength;
        j++
      ) {
        if (
          current.high <=
            candles[i - j].high ||
          current.high <
            candles[i + j].high
        ) {
          swingHigh = false;
        }

        if (
          current.low >=
            candles[i - j].low ||
          current.low >
            candles[i + j].low
        ) {
          swingLow = false;
        }
      }

      if (swingHigh) {
        swings.push({
          index: i,
          price: current.high,
          high: true,
          label: ""
        });
      }

      if (swingLow) {
        swings.push({
          index: i,
          price: current.low,
          high: false,
          label: ""
        });
      }
    }

    return swings;
  }

  classifySwings(
    swings,
    result
  ) {
    let previousHigh = null;
    let previousLow = null;

    for (const swing of swings) {
      if (swing.high) {

        if (previousHigh) {

          if (
            swing.price >
            previousHigh.price
          ) {
            swing.label = "HH";
            result.higherHighs++;

          } else if (
            swing.price <
            previousHigh.price
          ) {
            swing.label = "LH";
            result.lowerHighs++;

          } else {
            swing.label = "EH";
          }

        } else {
          swing.label = "H";
        }

        previousHigh = swing;

      } else {

        if (previousLow) {

          if (
            swing.price >
            previousLow.price
          ) {
            swing.label = "HL";
            result.higherLows++;

          } else if (
            swing.price <
            previousLow.price
          ) {
            swing.label = "LL";
            result.lowerLows++;

          } else {
            swing.label = "EL";
          }

        } else {
          swing.label = "L";
        }

        previousLow = swing;
      }
    }
  }

  determineRecentTrend(
    result
  ) {
    let bullish = 0;
    let bearish = 0;

    const start =
      Math.max(
        0,
        result.swings.length -
          8
      );

    let weight = 1;

    for (
      let i = start;
      i <
      result.swings.length;
      i++
    ) {
      const label =
        result.swings[i]
          .label;

      if (
        label === "HH" ||
        label === "HL"
      ) {
        bullish += weight;

      } else if (
        label === "LH" ||
        label === "LL"
      ) {
        bearish += weight;
      }

      weight++;
    }

    result.bullishRecentScore =
      bullish;

    result.bearishRecentScore =
      bearish;

    if (
      bullish >=
      bearish + 3
    ) {
      result.trend =
        "BULLISH";

      result.recentBias =
        "BULLISH STRUCTURE";

    } else if (
      bearish >=
      bullish + 3
    ) {
      result.trend =
        "BEARISH";

      result.recentBias =
        "BEARISH STRUCTURE";

    } else {
      result.trend =
        "SIDEWAYS / MIXED";

      result.recentBias =
        "MIXED STRUCTURE";
    }
  }

  calculateSupportResistance(
    candles,
    result
  ) {
    if (!candles.length) {
      return;
    }

    const currentPrice =
      candles[
        candles.length - 1
      ].close;

    let nearestSupport =
      NaN;

    let nearestResistance =
      NaN;

    for (
      const swing of
      result.swings
    ) {
      if (
        !swing.high &&
        swing.price <=
          currentPrice
      ) {
        if (
          Number.isNaN(
            nearestSupport
          ) ||
          swing.price >
            nearestSupport
        ) {
          nearestSupport =
            swing.price;
        }
      }

      if (
        swing.high &&
        swing.price >=
          currentPrice
      ) {
        if (
          Number.isNaN(
            nearestResistance
          ) ||
          swing.price <
            nearestResistance
        ) {
          nearestResistance =
            swing.price;
        }
      }
    }

    // Do not invent support above current price
    // or resistance below current price.
    // If no valid level exists on the correct side,
    // keep it as NaN so downstream engines use
    // their safe ATR fallback.

    result.support =
      nearestSupport;

    result.resistance =
      nearestResistance;
  }

  detectStructureEvent(
    candles,
    result
  ) {
    if (
      result.swings.length <
        4 ||
      !candles.length
    ) {
      result.lastEvent =
        "NONE";

      return;
    }

    const latest =
      candles[
        candles.length - 1
      ];

    let previousHigh =
      null;

    let previousLow =
      null;

    for (
      let i =
        result.swings.length -
        1;
      i >= 0;
      i--
    ) {
      const swing =
        result.swings[i];

      if (
        swing.index >=
        candles.length - 1
      ) {
        continue;
      }

      if (
        swing.high &&
        previousHigh === null
      ) {
        previousHigh =
          swing;
      }

      if (
        !swing.high &&
        previousLow === null
      ) {
        previousLow =
          swing;
      }

      if (
        previousHigh &&
        previousLow
      ) {
        break;
      }
    }

    if (
      !previousHigh ||
      !previousLow
    ) {
      result.lastEvent =
        "NONE";

      return;
    }

    const brokeHigh =
      latest.close >
      previousHigh.price;

    const brokeLow =
      latest.close <
      previousLow.price;

    if (
      result.trend ===
      "BULLISH"
    ) {
      if (brokeLow) {
        result.lastEvent =
          "BEARISH CHoCH";

      } else if (
        brokeHigh
      ) {
        result.lastEvent =
          "BULLISH BOS";

      } else {
        result.lastEvent =
          "NO NEW BREAK";
      }

    } else if (
      result.trend ===
      "BEARISH"
    ) {
      if (brokeHigh) {
        result.lastEvent =
          "BULLISH CHoCH";

      } else if (
        brokeLow
      ) {
        result.lastEvent =
          "BEARISH BOS";

      } else {
        result.lastEvent =
          "NO NEW BREAK";
      }

    } else {
      if (brokeHigh) {
        result.lastEvent =
          "UPSIDE STRUCTURE BREAK";

      } else if (
        brokeLow
      ) {
        result.lastEvent =
          "DOWNSIDE STRUCTURE BREAK";

      } else {
        result.lastEvent =
          "NO NEW BREAK";
      }
    }
  }

  buildStructureSummary(r) {
    return (
      `HH: ${r.higherHighs}   HL: ${r.higherLows}\n` +
      `LH: ${r.lowerHighs}   LL: ${r.lowerLows}\n` +
      `Recent Bull Score: ${r.bullishRecentScore}\n` +
      `Recent Bear Score: ${r.bearishRecentScore}`
    );
  }
}


class PriceActionEngine {

  analyze(
    candles,
    structure
  ) {
    const result = {
      candleDirection:
        "NEUTRAL",

      candleStrength:
        "NORMAL",

      rejection:
        "NONE",

      breakout:
        "NONE",

      momentum:
        "NEUTRAL",

      bodyPercent: 0,
      upperWickPercent: 0,
      lowerWickPercent: 0,

      recentBullPower: 0,
      recentBearPower: 0,

      evidence: ""
    };

    if (
      !candles ||
      candles.length < 10
    ) {
      result.evidence =
        "Insufficient candle data";

      return result;
    }

    const last =
      candles[
        candles.length - 1
      ];

    this.analyzeLatestCandle(
      last,
      result
    );

    this.analyzeMomentum(
      candles,
      result
    );

    this.analyzeRejection(
      last,
      structure,
      result
    );

    this.analyzeBreakout(
      candles,
      structure,
      result
    );

    result.evidence =
      this.buildEvidence(
        result
      );

    return result;
  }

  analyzeLatestCandle(c, r) {
    const range =
      c.high - c.low;

    if (range <= 0) {
      return;
    }

    const body =
      Math.abs(
        c.close - c.open
      );

    const upperWick =
      c.high -
      Math.max(
        c.open,
        c.close
      );

    const lowerWick =
      Math.min(
        c.open,
        c.close
      ) -
      c.low;

    r.bodyPercent =
      body / range * 100;

    r.upperWickPercent =
      upperWick /
      range *
      100;

    r.lowerWickPercent =
      lowerWick /
      range *
      100;

    if (
      c.close >
      c.open
    ) {
      r.candleDirection =
        "BULLISH";

    } else if (
      c.close <
      c.open
    ) {
      r.candleDirection =
        "BEARISH";

    } else {
      r.candleDirection =
        "DOJI / NEUTRAL";
    }

    if (
      r.bodyPercent >= 70
    ) {
      r.candleStrength =
        "STRONG";

    } else if (
      r.bodyPercent <= 30
    ) {
      r.candleStrength =
        "WEAK / INDECISION";

    } else {
      r.candleStrength =
        "NORMAL";
    }
  }

  analyzeMomentum(
    candles,
    r
  ) {
    const start =
      Math.max(
        0,
        candles.length - 8
      );

    let bull = 0;
    let bear = 0;

    for (
      let i = start;
      i <
      candles.length;
      i++
    ) {
      const c =
        candles[i];

      const range =
        c.high - c.low;

      if (range <= 0) {
        continue;
      }

      const body =
        Math.abs(
          c.close - c.open
        );

      const strength =
        body / range;

      const recencyWeight =
        i - start + 1;

      if (
        c.close >
        c.open
      ) {
        bull +=
          strength *
          recencyWeight;

      } else if (
        c.close <
        c.open
      ) {
        bear +=
          strength *
          recencyWeight;
      }
    }

    r.recentBullPower =
      bull;

    r.recentBearPower =
      bear;

    if (
      bull >
      bear * 1.25
    ) {
      r.momentum =
        "BULLISH MOMENTUM";

    } else if (
      bear >
      bull * 1.25
    ) {
      r.momentum =
        "BEARISH MOMENTUM";

    } else {
      r.momentum =
        "BALANCED / MIXED";
    }
  }

  analyzeRejection(
    last,
    structure,
    r
  ) {
    const range =
      last.high -
      last.low;

    if (range <= 0) {
      return;
    }

    const tolerance =
      range * 0.50;

    const nearSupport =
      !Number.isNaN(
        structure.support
      ) &&
      Math.abs(
        last.low -
        structure.support
      ) <= tolerance;

    const nearResistance =
      !Number.isNaN(
        structure.resistance
      ) &&
      Math.abs(
        last.high -
        structure.resistance
      ) <= tolerance;

    if (
      nearSupport &&
      r.lowerWickPercent >=
        45 &&
      last.close >
        last.open
    ) {
      r.rejection =
        "BULLISH SUPPORT REJECTION";

    } else if (
      nearResistance &&
      r.upperWickPercent >=
        45 &&
      last.close <
        last.open
    ) {
      r.rejection =
        "BEARISH RESISTANCE REJECTION";

    } else if (
      r.lowerWickPercent >=
      55
    ) {
      r.rejection =
        "LOWER-PRICE REJECTION";

    } else if (
      r.upperWickPercent >=
      55
    ) {
      r.rejection =
        "HIGHER-PRICE REJECTION";

    } else {
      r.rejection =
        "NO STRONG REJECTION";
    }
  }

  analyzeBreakout(
    candles,
    structure,
    r
  ) {
    const last =
      candles[
        candles.length - 1
      ];

    const previous =
      candles[
        candles.length - 2
      ];

    if (
      !Number.isNaN(
        structure.resistance
      )
    ) {
      const level =
        structure.resistance;

      if (
        last.high > level &&
        last.close < level
      ) {
        r.breakout =
          "POSSIBLE BULL TRAP / FAILED UPSIDE BREAK";

        return;
      }

      if (
        previous.close <=
          level &&
        last.close > level
      ) {
        if (
          r.bodyPercent >=
          55
        ) {
          r.breakout =
            "CONFIRMED UPSIDE BREAKOUT";

        } else {
          r.breakout =
            "WEAK UPSIDE BREAK";
        }

        return;
      }
    }

    if (
      !Number.isNaN(
        structure.support
      )
    ) {
      const level =
        structure.support;

      if (
        last.low < level &&
        last.close > level
      ) {
        r.breakout =
          "POSSIBLE BEAR TRAP / FAILED DOWNSIDE BREAK";

        return;
      }

      if (
        previous.close >=
          level &&
        last.close < level
      ) {
        if (
          r.bodyPercent >=
          55
        ) {
          r.breakout =
            "CONFIRMED DOWNSIDE BREAKOUT";

        } else {
          r.breakout =
            "WEAK DOWNSIDE BREAK";
        }

        return;
      }
    }

    r.breakout =
      "NO ACTIVE BREAKOUT";
  }

  buildEvidence(r) {
    return (
      `Latest candle: ${r.candleDirection} / ${r.candleStrength}\n` +
      `Momentum: ${r.momentum}\n` +
      `Rejection: ${r.rejection}\n` +
      `Breakout: ${r.breakout}`
    );
  }
}

window.MarketStructureEngine =
  MarketStructureEngine;

window.PriceActionEngine =
  PriceActionEngine;
