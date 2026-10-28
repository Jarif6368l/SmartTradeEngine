const fs = require("fs");
const path = require("path");

const HISTORY_FILE =
  path.join(
    __dirname,
    ".signal-history.json"
  );





const HISTORY_PREV_FILE =
  `${HISTORY_FILE}.prev`;
function readHistoryFile(
  filePath
) {

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );


  const data =
    JSON.parse(
      raw
    );


  if (
    !Array.isArray(
      data
    )
  ) {

    throw new Error(
      "Signal history root must be an array"
    );
  }


  return data;
}


function readHistoryFromPaths(
  primaryFile,
  previousFile,
  logRecovery = false
) {

  const primaryExists =
    fs.existsSync(
      primaryFile
    );

  const previousExists =
    fs.existsSync(
      previousFile
    );


  /*
   * Genuine first run:
   * no history exists yet.
   */
  if (
    !primaryExists &&
    !previousExists
  ) {
    return [];
  }


  let primaryError =
    null;


  if (primaryExists) {

    try {

      return readHistoryFile(
        primaryFile
      );

    } catch (error) {

      primaryError =
        error;
    }
  }


  if (previousExists) {

    try {

      const recovered =
        readHistoryFile(
          previousFile
        );


      if (logRecovery) {

        console.warn(
          "[Signal History] Primary history unavailable/corrupt • recovered previous generation"
        );
      }


      return recovered;

    } catch (previousError) {

      throw new Error(
        "Signal history primary and recovery backup are unreadable. " +
        "Primary: " +
        (
          primaryError
            ? primaryError.message
            : "missing"
        ) +
        " • Backup: " +
        previousError.message
      );
    }
  }


  /*
   * Primary existed but could not be parsed.
   * Never pretend this is an empty lifetime history.
   */
  throw new Error(
    "Signal history primary is unreadable and no recovery backup exists: " +
    (
      primaryError
        ? primaryError.message
        : "unknown error"
    )
  );
}


function readAll() {

  return readHistoryFromPaths(
    HISTORY_FILE,
    HISTORY_PREV_FILE,
    true
  );
}


function writeHistoryAtomic(
  filePath,
  rows
) {

  if (
    !Array.isArray(
      rows
    )
  ) {

    throw new TypeError(
      "Signal history must be an array"
    );
  }


  const tmp =
    `${filePath}.tmp`;

  const previous =
    `${filePath}.prev`;

  const previousTmp =
    `${filePath}.prev.tmp`;


  const json =
    JSON.stringify(
      rows,
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

      readHistoryFile(
        filePath
      );

      rotateCurrent =
        true;

    } catch {

      /*
       * Never replace a good .prev backup
       * with a corrupt primary file.
       */
      rotateCurrent =
        false;
    }
  }


  try {

    fs.writeFileSync(
      tmp,
      json,
      "utf8"
    );


    const fd =
      fs.openSync(
        tmp,
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


    if (rotateCurrent) {

      fs.copyFileSync(
        filePath,
        previousTmp
      );

      fs.renameSync(
        previousTmp,
        previous
      );
    }


    fs.renameSync(
      tmp,
      filePath
    );

  } catch (error) {

    for (
      const temp of [
        tmp,
        previousTmp
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


function writeAll(rows) {

  /*
   * Lifetime history:
   * no automatic old-signal deletion.
   */
  writeHistoryAtomic(
    HISTORY_FILE,
    rows
  );


  /*
   * Automatic phone-storage backup.
   */
  try {

    const downloads =
      path.join(
        process.env.HOME ||
          __dirname,
        "storage",
        "downloads"
      );


    if (
      fs.existsSync(
        downloads
      )
    ) {

      const mirror =
        path.join(
          downloads,
          "AITradingWebsite-signal-history-backup.json"
        );


      // fs.copyFileSync disabled to save storage


      const day =
        new Date()
          .toISOString()
          .slice(0, 10);


      const daily =
        path.join(
          downloads,
          `AITradingWebsite-signal-history-${day}.json`
        );


      // fs.copyFileSync disabled to save storage
    }

  } catch (error) {

    console.error(
      "[Signal History] Phone backup failed:",
      error.message
    );
  }
}


function makeId(
  symbol,
  mode
) {

  return [
    Date.now(),
    String(symbol || "")
      .replace(
        /[^A-Za-z0-9]/g,
        ""
      ),
    String(mode || ""),
    Math.random()
      .toString(36)
      .slice(2, 8)
  ].join("-");
}


function addSignalHistory(
  record
) {

  const rows =
    readAll();

  const saved = {
    id:
      makeId(
        record.symbol,
        record.mode
      ),

    status:
      "ACTIVE",

    sentAt:
      new Date()
        .toISOString(),

    closedAt:
      null,

    closedReason:
      null,

    outcome:
      "OPEN",

    outcomeAt:
      null,

    t1HitAt:
      null,

    t2HitAt:
      null,

    slHitAt:
      null,

    durationMinutes:
      null,

    maxRReached:
      0,

    outcomeR:
      null,

    highestPriceSeen:
      null,

    lowestPriceSeen:
      null,

    ...record
  };

  rows.push(
    saved
  );

  writeAll(
    rows
  );

  return saved;
}


function closeSignalHistory(
  id,
  extra = {}
) {

  if (!id) {
    return null;
  }

  const rows =
    readAll();

  const index =
    rows.findIndex(
      row =>
        row.id === id
    );

  if (index < 0) {
    return null;
  }

  const current =
    rows[index];

  /*
   * Do not overwrite a terminal market outcome.
   */
  if (
    current.status === "INACTIVE"
  ) {
    return current;
  }

  const now =
    new Date();

  const sent =
    Date.parse(
      current.sentAt || ""
    );

  rows[index] = {
    ...current,

    status:
      "INACTIVE",

    outcomeTrackingMethod: "SETUP_STATE_CHANGE",
    outcomeTimePrecision: "DETECTION_TIME",

    closedAt:
      now.toISOString(),

    closedReason:
      extra.closedReason ||
      "Setup no longer meets TRADE-CANDIDATE rules",

    outcome:
      extra.outcome ||
      "INVALIDATED",

    outcomeAt:
      extra.outcomeAt ||
      now.toISOString(),

    durationMinutes:
      Number.isFinite(sent)
        ? Math.max(
            0,
            Math.round(
              (
                now.getTime() -
                sent
              ) /
              60000
            )
          )
        : current.durationMinutes
  };

  writeAll(
    rows
  );

  return rows[index];
}



function getSignalHistoryById(
  id
) {

  if (!id) {
    return null;
  }

  return (
    readAll()
      .find(
        row =>
          row.id === id
      ) ||
    null
  );
}


function updateSignalHistory(
  id,
  patch = {}
) {

  if (!id) {
    return null;
  }

  const rows =
    readAll();

  const index =
    rows.findIndex(
      row =>
        row.id === id
    );

  if (index < 0) {
    return null;
  }

  rows[index] = {
    ...rows[index],
    ...patch,

    updatedAt:
      new Date()
        .toISOString()
  };

  writeAll(
    rows
  );

  return rows[index];
}


function deleteSignalHistory(
  id
) {

  if (!id) {
    return false;
  }

  const rows =
    readAll();

  const next =
    rows.filter(
      row =>
        row.id !== id
    );

  if (
    next.length ===
    rows.length
  ) {
    return false;
  }

  writeAll(
    next
  );

  return true;
}


function listSignalHistory({
  limit = 200,
  pair = "",
  style = "",
  status = ""
} = {}) {

  const cleanPair =
    String(pair || "")
      .trim()
      .toUpperCase();

  const cleanStyle =
    String(style || "")
      .trim()
      .toLowerCase();

  const cleanStatus =
    String(status || "")
      .trim()
      .toUpperCase();

  const safeLimit =
    Math.max(
      1,
      Math.min(
        1000,
        Number(limit) || 200
      )
    );

  return readAll()
    .filter(
      row =>
        !cleanPair ||
        String(
          row.symbol || ""
        ).toUpperCase() ===
          cleanPair
    )
    .filter(
      row =>
        !cleanStyle ||
        String(
          row.mode || ""
        ).toLowerCase() ===
          cleanStyle
    )
    .filter(
      row =>
        !cleanStatus ||
        String(
          row.status || ""
        ).toUpperCase() ===
          cleanStatus
    )
    .sort(
      (a, b) =>
        Date.parse(
          b.sentAt || 0
        ) -
        Date.parse(
          a.sentAt || 0
        )
    )
    .slice(
      0,
      safeLimit
    );
}


function getSignalHistoryStats() {

  const allRows =
    readAll();

  function average(
    rows,
    getter
  ) {

    const values =
      rows
        .map(getter)
        .filter(
          value =>
            value !== null &&
            value !== undefined &&
            value !== "" &&
            Number.isFinite(
              Number(value)
            )
        )
        .map(Number);

    if (!values.length) {
      return null;
    }

    return (
      values.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      values.length
    );
  }


  function summarize(
    rows
  ) {

    const outcome =
      row =>
        String(
          row.outcome || ""
        ).toUpperCase();

    const t1Touched =
      rows.filter(
        row =>
          Boolean(
            row.t1HitAt
          ) ||
          outcome(row) ===
            "T1_HIT" ||
          outcome(row) ===
            "T2_HIT"
      ).length;

    const t2Hit =
      rows.filter(
        row =>
          Boolean(
            row.t2HitAt
          ) ||
          outcome(row) ===
            "T2_HIT"
      ).length;

    return {
      total:
        rows.length,

      active:
        rows.filter(
          row =>
            String(
              row.status || ""
            ).toUpperCase() ===
              "ACTIVE"
        ).length,

      t1Touched,

      t2Hit,

      slHit:
        rows.filter(
          row =>
            outcome(row) ===
              "SL_HIT"
        ).length,

      invalidated:
        rows.filter(
          row =>
            outcome(row) ===
              "INVALIDATED"
        ).length,

      ambiguous:
        rows.filter(
          row =>
            outcome(row) ===
              "AMBIGUOUS"
        ).length,

      expired:
        rows.filter(
          row =>
            outcome(row) ===
              "EXPIRED"
        ).length,

      styleChanged:
        rows.filter(
          row =>
            outcome(row) ===
              "STYLE_CHANGED"
        ).length,

      averageSetupQuality:
        average(
          rows,
          row =>
            row.setupQuality
        ),

      averageMaxR:
        average(
          rows,
          row =>
            row.maxRReached
        ),

      recordedOutcomeCount:
        rows.filter(row =>
          row.outcomeR !== null &&
          row.outcomeR !== undefined &&
          row.outcomeR !== "" &&
          Number.isFinite(Number(row.outcomeR))
        ).length,

      averageOutcomeR:
        average(rows, row => row.outcomeR)
    };
  }


  function breakdown(
    keyGetter
  ) {

    const groups =
      new Map();

    for (const row of allRows) {

      const key =
        String(
          keyGetter(row) ||
          "UNKNOWN"
        );

      if (!groups.has(key)) {
        groups.set(
          key,
          []
        );
      }

      groups
        .get(key)
        .push(row);
    }

    return [
      ...groups.entries()
    ]
      .map(
        ([name, rows]) => ({
          name,
          ...summarize(rows)
        })
      )
      .sort(
        (a, b) =>
          b.total -
            a.total ||
          a.name.localeCompare(
            b.name
          )
      );
  }


  return {
    generatedAt:
      new Date()
        .toISOString(),

    summary:
      summarize(
        allRows
      ),

    byPair:
      breakdown(
        row =>
          row.symbol
      ),

    byStyle:
      breakdown(
        row =>
          row.styleLabel ||
          row.mode
      )
  };
}


function exportSignalHistory() {

  return readAll()
    .sort(
      (a, b) =>
        Date.parse(
          b.sentAt || 0
        ) -
        Date.parse(
          a.sentAt || 0
        )
    );
}


/* === PHASE 1: READ-ONLY OUTCOME LEARNING ANALYTICS ===
 *
 * This helper aggregates historical signal records for statistical
 * reporting ONLY. It is intentionally isolated from the trading brain
 * and is NEVER used to influence signal generation, entry/SL/T1/T2,
 * confidence, or any live decision.
 *
 * The helper is READ-ONLY. Calling it does not mutate
 * .signal-history.json, watcher state, or any runtime file.
 *
 * Terminology note:
 *   The label "historical evidence" refers to an observed outcome rate
 *   across past records. It is NOT a model prediction and NOT proof of
 *   predictive power. No model training occurs anywhere in this file.
 */


const LEARNING_OUTCOME_TYPES = [
  "SL_HIT",
  "T1_HIT",
  "T2_HIT",
  "INVALIDATED",
  "AMBIGUOUS",
  "EXPIRED",
  "STYLE_CHANGED",
  "SETUP_REPLACED"
];

const LEARNING_CONFIDENCE_LABELS = {
  insufficient: "insufficient",
  weak: "weak",
  emerging: "emerging",
  evidence: "evidence",
  established: "established"
};


function learningQualityBand(quality) {

  const q =
    Number(quality);

  if (!Number.isFinite(q)) {
    return null;
  }

  if (q < 55) return "<55";
  if (q < 65) return "55-64";
  if (q < 75) return "65-74";
  if (q < 85) return "75-84";
  return "85-100";
}


function learningConfidenceLabel(sampleCount) {

  const n =
    Number(sampleCount) || 0;

  if (n <= 9) {
    return LEARNING_CONFIDENCE_LABELS.insufficient;
  }

  if (n <= 19) {
    return LEARNING_CONFIDENCE_LABELS.weak;
  }

  if (n <= 49) {
    return LEARNING_CONFIDENCE_LABELS.emerging;
  }

  if (n <= 99) {
    return LEARNING_CONFIDENCE_LABELS.evidence;
  }

  return LEARNING_CONFIDENCE_LABELS.established;
}


function computeLearningEvidence(filters = {}) {

  const rows =
    readAll();

  const f =
    filters && typeof filters === "object"
      ? filters
      : {};

  const wantedSymbol =
    f.symbol
      ? String(f.symbol).toUpperCase()
      : null;

  const wantedMarketType =
    f.marketType
      ? String(f.marketType).toLowerCase()
      : null;

  const wantedExchange =
    f.exchange
      ? String(f.exchange).toUpperCase()
      : null;

  const wantedMode =
    f.mode
      ? String(f.mode).toLowerCase()
      : null;

  const wantedDirection =
    f.direction
      ? String(f.direction).toUpperCase()
      : null;

  const wantedTimeframe =
    f.executionTimeframe
      ? String(f.executionTimeframe).toUpperCase()
      : null;

  const wantedQualityBand =
    f.setupQualityBand || null;

  const wantedRiskDecision =
    f.riskDecision
      ? String(f.riskDecision).toUpperCase()
      : null;

  const wantedAlignment =
    f.alignment
      ? String(f.alignment).toUpperCase()
      : null;

  const wantedHtfBias =
    f.higherTimeframeBias
      ? String(f.higherTimeframeBias).toUpperCase()
      : null;

  const wantedFinalBias =
    f.finalBias
      ? String(f.finalBias).toUpperCase()
      : null;

  const wantedFinalState =
    f.finalState
      ? String(f.finalState).toUpperCase()
      : null;

  const wantedConfidence =
    f.confidence
      ? String(f.confidence).toUpperCase()
      : null;

  const wantedMtfConfidence =
    f.mtfConfidence
      ? String(f.mtfConfidence).toUpperCase()
      : null;

  const wantedEngineVersion =
    f.engineVersion
      ? String(f.engineVersion)
      : null;

  const excludeOpen =
    f.excludeOpen !== false;

  const matched =
    rows.filter(row => {

      if (!row || typeof row !== "object") {
        return false;
      }

      if (
        excludeOpen &&
        String(row.status || "").toUpperCase() !== "INACTIVE"
      ) {
        return false;
      }

      if (
        wantedSymbol &&
        String(row.symbol || "").toUpperCase() !== wantedSymbol
      ) {
        return false;
      }

      if (
        wantedMarketType &&
        String(row.marketType || "").toLowerCase() !== wantedMarketType
      ) {
        return false;
      }

      if (
        wantedExchange &&
        String(row.exchange || "").toUpperCase() !== wantedExchange
      ) {
        return false;
      }

      if (
        wantedMode &&
        String(row.mode || "").toLowerCase() !== wantedMode
      ) {
        return false;
      }

      if (
        wantedDirection &&
        String(row.direction || "").toUpperCase() !== wantedDirection
      ) {
        return false;
      }

      if (
        wantedTimeframe &&
        String(row.executionTimeframe || "").toUpperCase() !== wantedTimeframe
      ) {
        return false;
      }

      if (wantedQualityBand) {
        const band =
          learningQualityBand(row.setupQuality);
        if (band !== wantedQualityBand) {
          return false;
        }
      }

      if (
        wantedRiskDecision &&
        String(row.riskDecision || "").toUpperCase() !== wantedRiskDecision
      ) {
        return false;
      }

      if (
        wantedAlignment &&
        String(row.alignment || "").toUpperCase() !== wantedAlignment
      ) {
        return false;
      }

      if (
        wantedHtfBias &&
        String(row.higherTimeframeBias || "").toUpperCase() !== wantedHtfBias
      ) {
        return false;
      }

      if (
        wantedFinalBias &&
        String(row.finalBias || "").toUpperCase() !== wantedFinalBias
      ) {
        return false;
      }

      if (
        wantedFinalState &&
        String(row.finalState || "").toUpperCase() !== wantedFinalState
      ) {
        return false;
      }

      if (
        wantedConfidence &&
        String(row.confidence || "").toUpperCase() !== wantedConfidence
      ) {
        return false;
      }

      if (
        wantedMtfConfidence &&
        String(row.mtfConfidence || "").toUpperCase() !== wantedMtfConfidence
      ) {
        return false;
      }

      if (
        wantedEngineVersion &&
        String(row.engineVersion || "") !== wantedEngineVersion
      ) {
        return false;
      }

      return true;
    });


  const sampleCount =
    matched.length;


  const countOutcome = outcome =>
    matched.filter(
      r => String(r.outcome || "").toUpperCase() === outcome
    ).length;


  const slHit = countOutcome("SL_HIT");
  const t1Hit = countOutcome("T1_HIT");
  const t2Hit = countOutcome("T2_HIT");
  const invalidated = countOutcome("INVALIDATED");


  const rate = n =>
    sampleCount > 0
      ? Number((n / sampleCount).toFixed(4))
      : 0;


  const slRate = rate(slHit);
  const t1Rate = rate(t1Hit);
  const t2Rate = rate(t2Hit);
  const invalidationRate = rate(invalidated);


  const rValues =
    matched
      .map(r => Number(r.outcomeR))
      .filter(v => Number.isFinite(v));


  const avgR =
    rValues.length > 0
      ? Number(
          (
            rValues.reduce((a, b) => a + b, 0) /
            rValues.length
          ).toFixed(4)
        )
      : null;


  let medianR = null;

  if (rValues.length > 0) {
    const sorted =
      [...rValues].sort((a, b) => a - b);
    const mid =
      Math.floor(sorted.length / 2);
    medianR =
      sorted.length % 2 === 1
        ? sorted[mid]
        : Number(
            ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(4)
          );
  }


  const maxRValues =
    matched
      .map(r => Number(r.maxRReached))
      .filter(v => Number.isFinite(v));

  const avgMaxR =
    maxRValues.length > 0
      ? Number(
          (
            maxRValues.reduce((a, b) => a + b, 0) /
            maxRValues.length
          ).toFixed(4)
        )
      : null;


  const engineVersions =
    [...new Set(
      matched
        .map(r => r.engineVersion)
        .filter(v => typeof v === "string" && v.length > 0)
    )];

  const mixedRuleset =
    engineVersions.length > 1;


  const confidenceLevel =
    learningConfidenceLabel(sampleCount);


  const slReasonCount =
    matched.filter(
      r => typeof r.slReason === "string" && r.slReason.trim().length > 0
    ).length;


  let evidenceString;

  if (sampleCount === 0) {
    evidenceString = "No historical evidence available for this setup pattern.";
  } else if (sampleCount <= 9) {
    evidenceString =
      "Insufficient historical evidence (" +
      sampleCount +
      " sample" +
      (sampleCount === 1 ? "" : "s") +
      "). No reliable pattern can be described yet.";
  } else if (sampleCount <= 19) {
    evidenceString =
      "Weak historical evidence (" +
      sampleCount +
      " samples). Observed SL rate " +
      (slRate * 100).toFixed(1) +
      "%. Insufficient sample size for a reliable pattern.";
  } else {
    evidenceString =
      "Historical evidence: Similar setups had " +
      (slRate * 100).toFixed(1) +
      "% SL rate over " +
      sampleCount +
      " samples.";
  }

  if (mixedRuleset) {
    evidenceString +=
      " Note: sample spans multiple engine versions (" +
      engineVersions.join(", ") +
      "); treat with caution.";
  }


  return {
    sampleCount,
    slHit,
    t1Hit,
    t2Hit,
    invalidated,
    slRate,
    t1Rate,
    t2Rate,
    invalidationRate,
    avgR,
    medianR,
    avgMaxR,
    engineVersions,
    mixedRuleset,
    confidenceLevel,
    slReasonCount,
    evidenceString
  };
}


module.exports = {
  addSignalHistory,
  closeSignalHistory,
  listSignalHistory,
  getSignalHistoryById,
  updateSignalHistory,
  getSignalHistoryStats,
  exportSignalHistory,
  deleteSignalHistory,
  readHistoryFromPaths,
  writeHistoryAtomic,
  computeLearningEvidence,
  learningConfidenceLabel,
  learningQualityBand
};
