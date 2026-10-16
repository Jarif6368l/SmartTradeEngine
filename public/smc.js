class SmcIctEngine {

  analyze(
    candles,
    structure
  ) {

    const r = {
      equalHighLiquidity:
        "NO FRESH BUY-SIDE LIQUIDITY",

      equalLowLiquidity:
        "NO FRESH SELL-SIDE LIQUIDITY",

      equalHighStatus:
        "NONE",

      equalLowStatus:
        "NONE",

      equalHighLevel:
        NaN,

      equalLowLevel:
        NaN,

      liquiditySweep:
        "NO CONFIRMED SWEEP",

      displacement:
        "NO STRONG DISPLACEMENT",

      displacementQuality:
        "LOW",

      displacementRatio:
        0,

      displacementIndex:
        -1,

      fvg:
        "NO ACTIVE UNFILLED FVG",

      fvgStatus:
        "NONE",

      fvgMitigationPercent:
        0,

      fvgLow:
        NaN,

      fvgHigh:
        NaN,

      orderBlock:
        "NO CONFIRMED CANDIDATE",

      orderBlockQuality:
        "NONE",

      orderBlockLow:
        NaN,

      orderBlockHigh:
        NaN,

      dealingRangeLow:
        NaN,

      dealingRangeHigh:
        NaN,

      equilibrium:
        NaN,

      premiumDiscount:
        "UNKNOWN",

      context:
        "MIXED / INCOMPLETE EVIDENCE",

      confluenceGrade:
        "INCOMPLETE",

      bullishScore:
        0,

      bearishScore:
        0,

      evidence:
        ""
    };

    if (
      !candles ||
      candles.length < 20
    ) {

      r.evidence =
        "Insufficient data for SMC/ICT analysis";

      return r;
    }

    const avgRange =
      this.averageRange(
        candles,
        20
      );

    this.detectFreshLiquidity(
      candles,
      structure,
      avgRange,
      r
    );

    this.detectLiquiditySweep(
      candles,
      avgRange,
      r
    );

    this.detectDisplacement(
      candles,
      r
    );

    this.detectFairValueGap(
      candles,
      avgRange,
      r
    );

    this.detectOrderBlock(
      candles,
      structure,
      r
    );

    this.calculateDealingRange(
      candles,
      structure,
      r
    );

    this.determineConfluence(
      structure,
      r
    );

    r.evidence =
      this.buildEvidence(r);

    return r;
  }


  averageRange(
    candles,
    period
  ) {

    const start =
      Math.max(
        0,
        candles.length - period
      );

    let total = 0;
    let count = 0;

    for (
      let i = start;
      i < candles.length;
      i++
    ) {

      const c =
        candles[i];

      total +=
        Math.max(
          0,
          c.high - c.low
        );

      count++;
    }

    return count === 0
      ? 0
      : total / count;
  }


  detectFreshLiquidity(
    candles,
    structure,
    avgRange,
    r
  ) {

    if (
      !structure.swings ||
      structure.swings.length < 4
    ) {
      return;
    }

    const tolerance =
      Math.max(
        avgRange * 0.25,
        0.00001
      );

    this.findFreshEqualHigh(
      candles,
      structure,
      tolerance,
      r
    );

    this.findFreshEqualLow(
      candles,
      structure,
      tolerance,
      r
    );
  }


  findFreshEqualHigh(
    candles,
    structure,
    tolerance,
    r
  ) {

    for (
      let i =
        structure.swings.length - 1;
      i >= 1;
      i--
    ) {

      const a =
        structure.swings[i];

      if (!a.high) {
        continue;
      }

      const minJ =
        Math.max(
          0,
          i - 10
        );

      for (
        let j = i - 1;
        j >= minJ;
        j--
      ) {

        const b =
          structure.swings[j];

        if (!b.high) {
          continue;
        }

        if (
          Math.abs(
            a.price - b.price
          ) > tolerance
        ) {
          continue;
        }

        const level =
          (
            a.price +
            b.price
          ) / 2;

        const formedAt =
          Math.max(
            a.index,
            b.index
          );

        let consumedBeforeLatest =
          false;

        for (
          let k =
            formedAt + 1;
          k <
            candles.length - 1;
          k++
        ) {

          if (
            candles[k].high >
            level +
              tolerance *
              0.10
          ) {

            consumedBeforeLatest =
              true;

            break;
          }
        }

        if (
          !consumedBeforeLatest
        ) {

          r.equalHighLevel =
            level;

          r.equalHighLiquidity =
            "FRESH EQUAL HIGHS / BUY-SIDE LIQUIDITY";

          r.equalHighStatus =
            "FRESH";

          return;
        }
      }
    }
  }


  findFreshEqualLow(
    candles,
    structure,
    tolerance,
    r
  ) {

    for (
      let i =
        structure.swings.length - 1;
      i >= 1;
      i--
    ) {

      const a =
        structure.swings[i];

      if (a.high) {
        continue;
      }

      const minJ =
        Math.max(
          0,
          i - 10
        );

      for (
        let j = i - 1;
        j >= minJ;
        j--
      ) {

        const b =
          structure.swings[j];

        if (b.high) {
          continue;
        }

        if (
          Math.abs(
            a.price - b.price
          ) > tolerance
        ) {
          continue;
        }

        const level =
          (
            a.price +
            b.price
          ) / 2;

        const formedAt =
          Math.max(
            a.index,
            b.index
          );

        let consumedBeforeLatest =
          false;

        for (
          let k =
            formedAt + 1;
          k <
            candles.length - 1;
          k++
        ) {

          if (
            candles[k].low <
            level -
              tolerance *
              0.10
          ) {

            consumedBeforeLatest =
              true;

            break;
          }
        }

        if (
          !consumedBeforeLatest
        ) {

          r.equalLowLevel =
            level;

          r.equalLowLiquidity =
            "FRESH EQUAL LOWS / SELL-SIDE LIQUIDITY";

          r.equalLowStatus =
            "FRESH";

          return;
        }
      }
    }
  }


  detectLiquiditySweep(
    candles,
    avgRange,
    r
  ) {

    const last =
      candles[
        candles.length - 1
      ];

    const buffer =
      Math.max(
        avgRange * 0.05,
        0.000001
      );

    if (
      !Number.isNaN(
        r.equalHighLevel
      )
    ) {

      if (
        last.high >
        r.equalHighLevel +
          buffer
      ) {

        if (
          last.close <
          r.equalHighLevel
        ) {

          r.liquiditySweep =
            "BUY-SIDE LIQUIDITY SWEEP";

          r.equalHighStatus =
            "SWEPT THIS CANDLE";

          return;

        } else {

          r.equalHighStatus =
            "CONSUMED / ACCEPTED ABOVE";

          r.equalHighLiquidity =
            "BUY-SIDE LIQUIDITY CONSUMED";
        }
      }
    }

    if (
      !Number.isNaN(
        r.equalLowLevel
      )
    ) {

      if (
        last.low <
        r.equalLowLevel -
          buffer
      ) {

        if (
          last.close >
          r.equalLowLevel
        ) {

          r.liquiditySweep =
            "SELL-SIDE LIQUIDITY SWEEP";

          r.equalLowStatus =
            "SWEPT THIS CANDLE";

          return;

        } else {

          r.equalLowStatus =
            "CONSUMED / ACCEPTED BELOW";

          r.equalLowLiquidity =
            "SELL-SIDE LIQUIDITY CONSUMED";
        }
      }
    }

    r.liquiditySweep =
      "NO CONFIRMED SWEEP";
  }


  detectDisplacement(
    candles,
    r
  ) {

    const last =
      candles.length - 1;

    const scanStart =
      Math.max(
        10,
        last - 4
      );

    let bestRatio = 0;

    for (
      let i = last;
      i >= scanStart;
      i--
    ) {

      const c =
        candles[i];

      const avgBody =
        this.averageBodyBefore(
          candles,
          i,
          10
        );

      if (avgBody <= 0) {
        continue;
      }

      const body =
        Math.abs(
          c.close -
          c.open
        );

      const range =
        c.high -
        c.low;

      if (range <= 0) {
        continue;
      }

      const ratio =
        body /
        avgBody;

      const bodyRatio =
        body /
        range;

      bestRatio =
        Math.max(
          bestRatio,
          ratio
        );

      if (
        ratio >= 1.50 &&
        bodyRatio >= 0.60
      ) {

        r.displacementIndex =
          i;

        r.displacementRatio =
          ratio;

        if (
          ratio >= 2.0 &&
          bodyRatio >= 0.70
        ) {

          r.displacementQuality =
            "HIGH";

        } else {

          r.displacementQuality =
            "MEDIUM";
        }

        if (
          c.close >
          c.open
        ) {

          r.displacement =
            "BULLISH DISPLACEMENT";

        } else {

          r.displacement =
            "BEARISH DISPLACEMENT";
        }

        return;
      }
    }

    r.displacementRatio =
      bestRatio;

    r.displacement =
      "NO STRONG DISPLACEMENT";

    r.displacementQuality =
      "LOW";
  }


  averageBodyBefore(
    candles,
    index,
    period
  ) {

    const start =
      Math.max(
        0,
        index - period
      );

    let total = 0;
    let count = 0;

    for (
      let i = start;
      i < index;
      i++
    ) {

      const c =
        candles[i];

      total +=
        Math.abs(
          c.close -
          c.open
        );

      count++;
    }

    return count === 0
      ? 0
      : total / count;
  }


  detectFairValueGap(
    candles,
    avgRange,
    r
  ) {

    /*
     * Ignore microscopic gaps.
     * A valid FVG must be at least
     * 10% of the recent average candle range.
     */
    const minGapSize =
      Number.isFinite(avgRange) &&
      avgRange > 0
        ? avgRange * 0.10
        : 0;

    const start =
      Math.max(
        2,
        candles.length - 40
      );

    for (
      let i =
        candles.length - 1;
      i >= start;
      i--
    ) {

      const left =
        candles[i - 2];

      const right =
        candles[i];

      if (
        right.low >
        left.high
      ) {

        const low =
          left.high;

        const high =
          right.low;

        const gapSize =
          high - low;

        if (
          gapSize <
          minGapSize
        ) {
          continue;
        }

        const mitigation =
          this.bullishFvgMitigation(
            candles,
            i,
            low,
            high
          );

        if (
          mitigation < 100
        ) {

          r.fvg =
            "BULLISH FVG";

          r.fvgLow =
            low;

          r.fvgHigh =
            high;

          r.fvgMitigationPercent =
            mitigation;

          r.fvgStatus =
            mitigation <= 1
              ? "ACTIVE / UNMITIGATED"
              : "PARTIALLY MITIGATED";

          return;
        }
      }

      if (
        right.high <
        left.low
      ) {

        const low =
          right.high;

        const high =
          left.low;

        const gapSize =
          high - low;

        if (
          gapSize <
          minGapSize
        ) {
          continue;
        }

        const mitigation =
          this.bearishFvgMitigation(
            candles,
            i,
            low,
            high
          );

        if (
          mitigation < 100
        ) {

          r.fvg =
            "BEARISH FVG";

          r.fvgLow =
            low;

          r.fvgHigh =
            high;

          r.fvgMitigationPercent =
            mitigation;

          r.fvgStatus =
            mitigation <= 1
              ? "ACTIVE / UNMITIGATED"
              : "PARTIALLY MITIGATED";

          return;
        }
      }
    }

    r.fvg =
      "NO ACTIVE UNFILLED FVG";

    r.fvgStatus =
      "NONE / FULLY MITIGATED";
  }


  bullishFvgMitigation(
    candles,
    gapIndex,
    low,
    high
  ) {

    const size =
      high - low;

    if (size <= 0) {
      return 100;
    }

    let lowest =
      Number.MAX_VALUE;

    let touched =
      false;

    for (
      let i =
        gapIndex + 1;
      i < candles.length;
      i++
    ) {

      lowest =
        Math.min(
          lowest,
          candles[i].low
        );

      touched =
        true;
    }

    if (
      !touched ||
      lowest >= high
    ) {
      return 0;
    }

    if (
      lowest <= low
    ) {
      return 100;
    }

    return Math.max(
      0,
      Math.min(
        100,
        (
          high - lowest
        ) /
          size *
          100
      )
    );
  }


  bearishFvgMitigation(
    candles,
    gapIndex,
    low,
    high
  ) {

    const size =
      high - low;

    if (size <= 0) {
      return 100;
    }

    let highest =
      -Number.MAX_VALUE;

    let touched =
      false;

    for (
      let i =
        gapIndex + 1;
      i < candles.length;
      i++
    ) {

      highest =
        Math.max(
          highest,
          candles[i].high
        );

      touched =
        true;
    }

    if (
      !touched ||
      highest <= low
    ) {
      return 0;
    }

    if (
      highest >= high
    ) {
      return 100;
    }

    return Math.max(
      0,
      Math.min(
        100,
        (
          highest - low
        ) /
          size *
          100
      )
    );
  }


  detectOrderBlock(
    candles,
    structure,
    r
  ) {

    if (
      r.displacementIndex <
      1
    ) {

      r.orderBlock =
        "NO CONFIRMED CANDIDATE";

      r.orderBlockQuality =
        "NONE";

      return;
    }

    const bullish =
      r.displacement ===
      "BULLISH DISPLACEMENT";

    const bearish =
      r.displacement ===
      "BEARISH DISPLACEMENT";

    const start =
      Math.max(
        0,
        r.displacementIndex -
          7
      );

    for (
      let i =
        r.displacementIndex -
        1;
      i >= start;
      i--
    ) {

      const c =
        candles[i];

      const opposite =
        bullish
          ? c.close < c.open
          : c.close > c.open;

      if (!opposite) {
        continue;
      }

      r.orderBlockLow =
        c.low;

      r.orderBlockHigh =
        c.high;

      let validation = 0;

      if (
        bullish &&
        structure.lastEvent
          .includes(
            "BULLISH"
          )
      ) {
        validation++;
      }

      if (
        bearish &&
        structure.lastEvent
          .includes(
            "BEARISH"
          )
      ) {
        validation++;
      }

      if (
        bullish &&
        r.fvg ===
        "BULLISH FVG"
      ) {
        validation++;
      }

      if (
        bearish &&
        r.fvg ===
        "BEARISH FVG"
      ) {
        validation++;
      }

      if (
        r.displacementQuality ===
        "HIGH"
      ) {
        validation++;
      }

      if (
        validation >= 2
      ) {

        r.orderBlockQuality =
          "VALIDATED";

        r.orderBlock =
          bullish
            ? "VALIDATED BULLISH ORDER BLOCK"
            : "VALIDATED BEARISH ORDER BLOCK";

      } else if (
        validation === 1
      ) {

        r.orderBlockQuality =
          "CANDIDATE";

        r.orderBlock =
          bullish
            ? "BULLISH ORDER BLOCK CANDIDATE"
            : "BEARISH ORDER BLOCK CANDIDATE";

      } else {

        r.orderBlockQuality =
          "WEAK";

        r.orderBlock =
          bullish
            ? "WEAK BULLISH ORDER BLOCK"
            : "WEAK BEARISH ORDER BLOCK";
      }

      return;
    }

    r.orderBlock =
      "NO CONFIRMED CANDIDATE";

    r.orderBlockQuality =
      "NONE";
  }


  calculateDealingRange(
    candles,
    structure,
    r
  ) {

    let low =
      structure.lastSwingLow;

    let high =
      structure.lastSwingHigh;

    if (
      Number.isNaN(low) ||
      Number.isNaN(high) ||
      high <= low
    ) {

      const start =
        Math.max(
          0,
          candles.length - 30
        );

      low =
        Number.MAX_VALUE;

      high =
        -Number.MAX_VALUE;

      for (
        let i = start;
        i < candles.length;
        i++
      ) {

        const c =
          candles[i];

        low =
          Math.min(
            low,
            c.low
          );

        high =
          Math.max(
            high,
            c.high
          );
      }
    }

    r.dealingRangeLow =
      low;

    r.dealingRangeHigh =
      high;

    if (
      high <= low
    ) {

      r.premiumDiscount =
        "UNKNOWN";

      return;
    }

    r.equilibrium =
      (
        high +
        low
      ) / 2;

    const current =
      candles[
        candles.length - 1
      ].close;

    const tolerance =
      (
        high - low
      ) * 0.05;

    if (
      Math.abs(
        current -
        r.equilibrium
      ) <= tolerance
    ) {

      r.premiumDiscount =
        "EQUILIBRIUM";

    } else if (
      current >
      r.equilibrium
    ) {

      r.premiumDiscount =
        "PREMIUM";

    } else {

      r.premiumDiscount =
        "DISCOUNT";
    }
  }


  determineConfluence(
    structure,
    r
  ) {

    let bull = 0;
    let bear = 0;

    if (
      structure.trend ===
      "BULLISH"
    ) {
      bull += 2;
    }

    if (
      structure.trend ===
      "BEARISH"
    ) {
      bear += 2;
    }

    if (
      structure.lastEvent
        .includes(
          "BULLISH"
        )
    ) {
      bull += 2;
    }

    if (
      structure.lastEvent
        .includes(
          "BEARISH"
        )
    ) {
      bear += 2;
    }

    if (
      r.liquiditySweep
        .includes(
          "SELL-SIDE"
        )
    ) {
      bull += 2;
    }

    if (
      r.liquiditySweep
        .includes(
          "BUY-SIDE"
        )
    ) {
      bear += 2;
    }

    if (
      r.displacement ===
      "BULLISH DISPLACEMENT"
    ) {
      bull += 2;
    }

    if (
      r.displacement ===
      "BEARISH DISPLACEMENT"
    ) {
      bear += 2;
    }

    if (
      r.fvg ===
      "BULLISH FVG"
    ) {
      bull++;
    }

    if (
      r.fvg ===
      "BEARISH FVG"
    ) {
      bear++;
    }

    if (
      r.orderBlock ===
      "VALIDATED BULLISH ORDER BLOCK"
    ) {
      bull += 2;
    }

    if (
      r.orderBlock ===
      "VALIDATED BEARISH ORDER BLOCK"
    ) {
      bear += 2;
    }

    if (
      r.premiumDiscount ===
      "DISCOUNT"
    ) {
      bull++;
    }

    if (
      r.premiumDiscount ===
      "PREMIUM"
    ) {
      bear++;
    }

    r.bullishScore =
      bull;

    r.bearishScore =
      bear;

    const dominant =
      Math.max(
        bull,
        bear
      );

    const difference =
      Math.abs(
        bull -
        bear
      );

    if (
      difference < 2
    ) {

      r.context =
        "MIXED / INCOMPLETE EVIDENCE";

      r.confluenceGrade =
        "INCOMPLETE";

      return;
    }

    const bullish =
      bull > bear;

    if (
      dominant >= 8
    ) {

      r.confluenceGrade =
        "STRONG";

      r.context =
        bullish
          ? "STRONG BULLISH CONFLUENCE"
          : "STRONG BEARISH CONFLUENCE";

    } else if (
      dominant >= 5
    ) {

      r.confluenceGrade =
        "MEDIUM";

      r.context =
        bullish
          ? "BULLISH BIAS — CONFIRMATION PARTIAL"
          : "BEARISH BIAS — CONFIRMATION PARTIAL";

    } else {

      r.confluenceGrade =
        "WEAK";

      r.context =
        bullish
          ? "WEAK BULLISH EVIDENCE"
          : "WEAK BEARISH EVIDENCE";
    }
  }


  buildEvidence(r) {

    return (
      `Context: ${r.context}\n` +
      `Confluence Grade: ${r.confluenceGrade}\n` +
      `Bull Score: ${r.bullishScore}   Bear Score: ${r.bearishScore}\n` +
      `Liquidity: ${r.liquiditySweep}\n` +
      `Displacement: ${r.displacement}\n` +
      `FVG: ${r.fvg}\n` +
      `Order Block: ${r.orderBlock}\n` +
      `Range Position: ${r.premiumDiscount}`
    );
  }
}

window.SmcIctEngine =
  SmcIctEngine;
