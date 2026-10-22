class ModeAnalysisEngine {

  getProfile(mode) {

    const profiles = {

      scalping: {
        key: "scalping",
        label: "Scalping",
        execution: "15m",
        context: "1H",
        higher: "4H"
      },

      intraday: {
        key: "intraday",
        label: "Intraday",
        execution: "15m",
        context: "1H",
        higher: "4H"
      },

      swing: {
        key: "swing",
        label: "Swing",
        execution: "1H",
        context: "4H",
        higher: "1D"
      }
    };

    return (
      profiles[mode] ||
      profiles.intraday
    );
  }


  frame(candles) {

    const structure =
      new MarketStructureEngine()
        .analyze(
          candles
        );

    const priceAction =
      new PriceActionEngine()
        .analyze(
          candles,
          structure
        );

    const smc =
      new SmcIctEngine()
        .analyze(
          candles,
          structure
        );

    return {
      candles,
      structure,
      priceAction,
      smc
    };
  }


  analyze(
    frames,
    mode
  ) {

    const profile =
      this.getProfile(mode);

    const result = {
      profile,

      daily:
        this.frame(
          frames.d1
        ),

      h4:
        this.frame(
          frames.h4
        ),

      h1:
        this.frame(
          frames.h1
        ),

      m15:
        this.frame(
          frames.m15
        ),

      bias:
        "NEUTRAL",

      decision:
        "WAIT",

      reason:
        "Context incomplete",

      nextCondition:
        "Wait for clearer structure.",

      executionFrame:
        null,

      plan:
        null
    };


    if (
      mode === "swing"
    ) {

      this.analyzeSwing(
        result
      );

    } else if (
      mode === "scalping"
    ) {

      this.analyzeScalping(
        result
      );

    } else {

      this.analyzeIntraday(
        result
      );
    }


    result.plan =
      this.buildTradePlan(
        result
      );


    // Keep the final decision synchronized
    // with the trade plan.
    if (
      result.decision ===
        "TRADE-CANDIDATE" &&
      result.plan.status !==
        "TRADE-CANDIDATE"
    ) {

      result.decision =
        result.plan.status;

      result.reason =
        result.plan.reason;

      if (
        result.plan.status ===
          "SKIP"
      ) {

        result.nextCondition =
          "Skip this setup. Wait for a new setup offering at least 1:1.5 R:R.";

      } else {

        result.nextCondition =
          "Wait for a valid execution structure and risk setup.";
      }
    }


    return result;
  }


  sameDirection(
    structure,
    bias
  ) {

    return (
      structure.trend ===
      bias
    );
  }


  oppositeDirection(
    structure,
    bias
  ) {

    return (
      bias === "BULLISH" &&
      structure.trend ===
        "BEARISH"
    ) || (
      bias === "BEARISH" &&
      structure.trend ===
        "BULLISH"
    );
  }


  momentumConfirms(
    priceAction,
    bias
  ) {

    return priceAction
      .momentum
      .includes(
        bias
      );
  }


  analyzeScalping(r) {

    r.executionFrame =
      r.m15;

    const h1 =
      r.h1.structure;

    if (
      h1.trend !==
        "BULLISH" &&
      h1.trend !==
        "BEARISH"
    ) {

      r.reason =
        "1H context has no clean direction";

      r.nextCondition =
        "Wait for 1H structure to become directional.";

      return;
    }

    r.bias =
      h1.trend;


    /*
     * Show the nearest execution failure first.
     * 4H remains a hard safety guard after
     * 15m execution has aligned.
     */
    if (
      !this.sameDirection(
        r.m15.structure,
        r.bias
      )
    ) {

      r.reason =
        "15m execution structure is not aligned";

      r.nextCondition =
        `Wait for 15m ${r.bias.toLowerCase()} structure confirmation.`;

      return;
    }


    if (
      !this.momentumConfirms(
        r.m15.priceAction,
        r.bias
      )
    ) {

      r.reason =
        "15m momentum is not confirming";

      r.nextCondition =
        `Wait for 15m momentum to turn ${r.bias.toLowerCase()}.`;

      return;
    }


    if (
      this.oppositeDirection(
        r.h4.structure,
        r.bias
      )
    ) {

      r.reason =
        "4H structure opposes the scalping direction";

      r.nextCondition =
        "Wait until 4H is no longer directly opposing the 1H setup.";

      return;
    }


    r.decision =
      "TRADE-CANDIDATE";

    r.reason =
      "Scalping: 1H direction and 15m execution are aligned; 4H structure is not directly opposing. Daily alignment is assessed separately.";

    r.nextCondition =
      "Use the marked execution levels and maintain strict risk control.";
  }


  analyzeIntraday(r) {

    r.executionFrame =
      r.m15;

    const h4 =
      r.h4.structure;

    if (
      h4.trend !==
        "BULLISH" &&
      h4.trend !==
        "BEARISH"
    ) {

      r.reason =
        "4H bias is not directional";

      r.nextCondition =
        "Wait for 4H structure to establish a clear direction.";

      return;
    }

    r.bias =
      h4.trend;


    if (
      !this.sameDirection(
        r.h1.structure,
        r.bias
      )
    ) {

      r.reason =
        "1H structure is not aligned with 4H bias";

      r.nextCondition =
        `Wait for 1H ${r.bias.toLowerCase()} structure confirmation.`;

      return;
    }


    if (
      !this.sameDirection(
        r.m15.structure,
        r.bias
      )
    ) {

      r.reason =
        "15m execution structure is not aligned";

      r.nextCondition =
        `Wait for 15m ${r.bias.toLowerCase()} execution structure.`;

      return;
    }


    if (
      !this.momentumConfirms(
        r.m15.priceAction,
        r.bias
      )
    ) {

      r.reason =
        "15m momentum is not confirming";

      r.nextCondition =
        `Wait for 15m momentum to confirm ${r.bias.toLowerCase()} continuation.`;

      return;
    }


    r.decision =
      "TRADE-CANDIDATE";

    r.reason =
      "4H bias, 1H structure and 15m execution are aligned";

    r.nextCondition =
      "Use the marked execution levels and maintain risk control.";
  }


  analyzeSwing(r) {

    r.executionFrame =
      r.h1;

    const d1 =
      r.daily.structure;

    const h4 =
      r.h4.structure;


    if (
      d1.trend !==
        "BULLISH" &&
      d1.trend !==
        "BEARISH"
    ) {

      r.reason =
        "Daily structure has no clean direction";

      r.nextCondition =
        "Wait for Daily structure to establish direction.";

      return;
    }


    r.bias =
      d1.trend;


    if (
      !this.sameDirection(
        h4,
        r.bias
      )
    ) {

      r.reason =
        "4H structure is not aligned with Daily bias";

      r.nextCondition =
        `Wait for 4H ${r.bias.toLowerCase()} structure confirmation.`;

      return;
    }


    if (
      !this.sameDirection(
        r.h1.structure,
        r.bias
      )
    ) {

      r.reason =
        "1H execution structure is not aligned";

      r.nextCondition =
        `Wait for 1H ${r.bias.toLowerCase()} execution structure.`;

      return;
    }


    if (
      !this.momentumConfirms(
        r.h1.priceAction,
        r.bias
      )
    ) {

      r.reason =
        "1H momentum is not confirming the swing setup";

      r.nextCondition =
        `Wait for 1H momentum to agree with the ${r.bias.toLowerCase()} structure.`;

      return;
    }


    r.decision =
      "TRADE-CANDIDATE";

    r.reason =
      "Daily, 4H and 1H swing conditions are aligned";

    r.nextCondition =
      "Use the marked swing plan and maintain risk control.";
  }


  atr(
    candles,
    period = 14
  ) {

    if (
      !candles ||
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

      const c =
        candles[i];

      const p =
        candles[i - 1];

      const tr =
        Math.max(
          c.high - c.low,

          Math.abs(
            c.high -
            p.close
          ),

          Math.abs(
            c.low -
            p.close
          )
        );

      total += tr;
      count++;
    }


    return count
      ? total / count
      : NaN;
  }


  buildTradePlan(r) {

    const f =
      r.executionFrame;

    const plan = {
      active:
        false,

      status:
        r.decision,

      entryLow:
        NaN,

      entryHigh:
        NaN,

      stop:
        NaN,

      target1:
        NaN,

      target2:
        NaN,

      rr1:
        NaN,

      rr2:
        NaN,

      atr:
        NaN,

      reason:
        r.reason
    };


    if (
      !f ||
      !f.candles.length
    ) {

      return plan;
    }


    const last =
      f.candles[
        f.candles.length - 1
      ];

    const price =
      last.close;

    const atr =
      this.atr(
        f.candles
      );

    plan.atr =
      atr;


    if (
      r.decision !==
        "TRADE-CANDIDATE" ||
      !Number.isFinite(
        atr
      )
    ) {

      return plan;
    }


    const structure =
      f.structure;


    if (
      r.bias ===
      "BULLISH"
    ) {

      plan.entryLow =
        price -
        atr * 0.12;

      plan.entryHigh =
        price +
        atr * 0.04;

      // Conservative R:R:
      // assume bullish entry fills at
      // the highest price in the zone.
      const referenceEntry =
        plan.entryHigh;


      const base =
        Number.isFinite(
          structure.lastSwingLow
        ) &&
        structure.lastSwingLow <
          price
          ? structure.lastSwingLow
          : (
              Number.isFinite(
                structure.support
              ) &&
              structure.support < price
                ? structure.support
                : price -
                  atr * 1.2
            );


      plan.stop =
        base -
        atr * 0.25;


      const risk =
        referenceEntry -
        plan.stop;


      if (
        risk <= 0
      ) {

        plan.status =
          "WAIT";

        plan.reason =
          "Invalid bullish risk structure";

        return plan;
      }


      const projected1 =
        referenceEntry +
        risk * 1.5;

      const projected2 =
        referenceEntry +
        risk * 2.5;


      const resistance =
        Number.isFinite(
          structure.resistance
        ) &&
        structure.resistance >
          price
          ? structure.resistance
          : NaN;


      if (
        Number.isFinite(
          resistance
        )
      ) {

        const obstacleRR =
          (
            resistance -
            referenceEntry
          ) /
          risk;


        if (
          obstacleRR < 1.5
        ) {

          plan.status =
            "SKIP";

          plan.reason =
            "Nearest resistance gives less than 1:1.5 R:R";

          return plan;
        }


        plan.target1 =
          projected1;

        plan.target2 =
          Math.min(
            projected2,
            resistance
          );

      } else {

        plan.target1 =
          projected1;

        plan.target2 =
          projected2;
      }


      plan.rr1 =
        (
          plan.target1 -
          referenceEntry
        ) /
        risk;

      plan.rr2 =
        (
          plan.target2 -
          referenceEntry
        ) /
        risk;

    } else if (
      r.bias ===
      "BEARISH"
    ) {

      plan.entryLow =
        price -
        atr * 0.04;

      plan.entryHigh =
        price +
        atr * 0.12;

      // Conservative R:R:
      // assume bearish entry fills at
      // the lowest price in the zone.
      const referenceEntry =
        plan.entryLow;


      const base =
        Number.isFinite(
          structure.lastSwingHigh
        ) &&
        structure.lastSwingHigh >
          price
          ? structure.lastSwingHigh
          : (
              Number.isFinite(
                structure.resistance
              ) &&
              structure.resistance > price
                ? structure.resistance
                : price +
                  atr * 1.2
            );


      plan.stop =
        base +
        atr * 0.25;


      const risk =
        plan.stop -
        referenceEntry;


      if (
        risk <= 0
      ) {

        plan.status =
          "WAIT";

        plan.reason =
          "Invalid bearish risk structure";

        return plan;
      }


      const projected1 =
        referenceEntry -
        risk * 1.5;

      const projected2 =
        referenceEntry -
        risk * 2.5;


      const support =
        Number.isFinite(
          structure.support
        ) &&
        structure.support <
          price
          ? structure.support
          : NaN;


      if (
        Number.isFinite(
          support
        )
      ) {

        const obstacleRR =
          (
            referenceEntry -
            support
          ) /
          risk;


        if (
          obstacleRR < 1.5
        ) {

          plan.status =
            "SKIP";

          plan.reason =
            "Nearest support gives less than 1:1.5 R:R";

          return plan;
        }


        plan.target1 =
          projected1;

        plan.target2 =
          Math.max(
            projected2,
            support
          );

      } else {

        plan.target1 =
          projected1;

        plan.target2 =
          projected2;
      }


      plan.rr1 =
        (
          referenceEntry -
          plan.target1
        ) /
        risk;

      plan.rr2 =
        (
          referenceEntry -
          plan.target2
        ) /
        risk;
    }


    plan.active =
      true;

    plan.status =
      "TRADE-CANDIDATE";

    return plan;
  }
}


window.ModeAnalysisEngine =
  ModeAnalysisEngine;
