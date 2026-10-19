(() => {

  const $ = id => document.getElementById(id);

  // Standalone heuristic table — separate from Trading Brain.
  const ALLOC_RULES = [
    { min: 85, alloc: 20, label: "Quality 85–100" },
    { min: 75, alloc: 15, label: "Quality 75–84" },
    { min: 65, alloc: 10, label: "Quality 65–74" },
    { min: 55, alloc: 7,  label: "Quality 55–64" },
    { min: 0,  alloc: 5,  label: "Quality below 55" }
  ];

  // Default fallback rate — used only if user has not yet set a custom rate.
  // The active rate is read from the "calcUsdInrRate" input (user-editable, persisted).
  const DEFAULT_USD_INR = 84;
  const DEFAULT_JPY_INR = 0.55;

  // Persistence keys
  const STORAGE_KEY = "aiTradingCalcSettings";

  let activeTrades = [];
  let currentTrade = null;

  function readSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return (data && typeof data === "object") ? data : null;
    } catch {
      return null;
    }
  }

  function writeSettings(partial) {
    try {
      const current = readSettings() || {};
      const next = { ...current, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  // Classify a trade's quote currency from symbol/exchange.
  // Returns "INR" for stocks, "JPY" for */JPY, otherwise "USD".
  function quoteCurrency(row) {
    if (!row) return "USD";
    const ex = String(row.exchange || "").toUpperCase();
    const type = String(row.marketType || "").toLowerCase();
    if (ex === "NSE" || ex === "BSE" || type === "stocks") return "INR";
    const sym = String(row.symbol || "").toUpperCase();
    if (sym.endsWith("/JPY")) return "JPY";
    return "USD";
  }

  // Internal rate: 1 unit of trade currency = N ₹
  // USD rate is user-editable via calcUsdInrRate input; falls back to default.
  function readUsdInrRate() {
    const el = $("calcUsdInrRate");
    if (!el) return DEFAULT_USD_INR;
    const v = Number(el.value);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_USD_INR;
  }

  function internalRateFor(ccy) {
    if (ccy === "INR") return 1;
    if (ccy === "JPY") return DEFAULT_JPY_INR;
    return readUsdInrRate();
  }

  function currencySymbol(ccy) {
    if (ccy === "INR") return "₹";
    if (ccy === "JPY") return "¥";
    return "$";
  }

  function pickLevels(row) {
    const num = v => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : NaN;
    };
    return {
      entry:
        num(row.entryReference) ||
        num(row.entryHigh) ||
        num(row.entryLow),
      sl: num(row.stopLoss),
      t1: num(row.target1),
      t2: num(row.target2)
    };
  }

  // Format native trade currency (prices, P&L, position value)
  function fmtNative(value, ccy) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    const sym = currencySymbol(ccy);
    let digits = 2;
    if (abs < 1) digits = 5;
    else if (abs < 100) digits = 4;
    return sign + sym + abs.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  // Format INR (capital / margin)
  function fmtINR(value) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    return sign + "₹" + abs.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function fmtQty(value) {
    if (!Number.isFinite(value)) return "--";
    if (Number.isInteger(value)) {
      return value.toLocaleString("en-US");
    }
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    });
  }

  function ruleFor(quality) {
    for (const r of ALLOC_RULES) {
      if (quality >= r.min) return r;
    }
    return ALLOC_RULES[ALLOC_RULES.length - 1];
  }

  function volMultiplier(vol) {
    const v = String(vol || "").toUpperCase();
    return v === "HIGH" ? 0.5 : 1.0;
  }

  function isStockMarket(row) {
    if (!row) return false;
    const ex = String(row.exchange || "").toUpperCase();
    const type = String(row.marketType || "").toLowerCase();
    return ex === "NSE" || ex === "BSE" || type === "stocks";
  }

  function readLeverage() {
    const el = $("calcLeverage");
    if (!el) return 1;
    const v = Number(el.value);
    return Number.isFinite(v) && v >= 1 ? v : 1;
  }

  function render() {
    const capital = Number($("calcCapital").value);

    if (!currentTrade || !Number.isFinite(capital) || capital <= 0) {
      $("calcDetailsCard").classList.add("calc-hidden");
      $("calcResultCard").classList.add("calc-hidden");
      $("calcLeverageCard").classList.add("calc-hidden");
      return;
    }

    const levels = pickLevels(currentTrade);
    if (!Number.isFinite(levels.entry) || !Number.isFinite(levels.sl)) {
      $("calcDetailsCard").classList.add("calc-hidden");
      $("calcResultCard").classList.add("calc-hidden");
      return;
    }

    const ccy = quoteCurrency(currentTrade);
    const rate = internalRateFor(ccy);

    // Leverage scenario only for non-stock markets
    if (isStockMarket(currentTrade)) {
      $("calcLeverageCard").classList.add("calc-hidden");
    } else {
      $("calcLeverageCard").classList.remove("calc-hidden");
    }

    const quality = Number(currentTrade.setupQuality) || 0;
    const volatility = String(currentTrade.volatility || "UNKNOWN").toUpperCase();

    // -- trade details (native currency) --
    $("calcDirection").textContent = currentTrade.direction || "--";
    $("calcMode").textContent = currentTrade.styleLabel || currentTrade.mode || "--";
    $("calcEntry").textContent = fmtNative(levels.entry, ccy);
    $("calcSL").textContent = fmtNative(levels.sl, ccy);
    $("calcT1").textContent = Number.isFinite(levels.t1)
      ? fmtNative(levels.t1, ccy) : "--";
    $("calcT2").textContent = Number.isFinite(levels.t2)
      ? fmtNative(levels.t2, ccy) : "--";
    $("calcQuality").textContent = quality ? quality + "/100" : "--";
    $("calcVolatility").textContent = volatility || "UNKNOWN";
    $("calcDetailsCard").classList.remove("calc-hidden");

    // -- allocation --
    const rule = ruleFor(quality);
    const mult = volMultiplier(volatility);
    const finalAllocPct = rule.alloc * mult;

    const stock = isStockMarket(currentTrade);
    const leverage = stock ? 1 : readLeverage();

    // Margin required in ₹ (user's committed capital)
    const targetMarginINR = capital * (finalAllocPct / 100);

    // Position value in ₹ then in native
    const targetPosValueINR = targetMarginINR * leverage;
    const targetPosValueNative = targetPosValueINR / rate;

    // Quantity in underlying units (fractional, 4 dp)
    const riskPerUnitNative = Math.abs(levels.entry - levels.sl);
    let quantity = 0;
    let actualPosValueNative = 0;
    let actualPosValueINR = 0;
    let actualMarginINR = 0;

    if (riskPerUnitNative > 0) {
      quantity =
        Math.floor((targetPosValueNative / levels.entry) * 10000) / 10000;
      if (quantity < 0) quantity = 0;
      actualPosValueNative = quantity * levels.entry;
      actualPosValueINR = actualPosValueNative * rate;
      actualMarginINR = leverage > 0 ? actualPosValueINR / leverage : 0;
    }

    const actualAllocPct = capital > 0
      ? (actualMarginINR / capital) * 100
      : 0;

    // -- rule note --
    $("calcRuleNote").textContent =
      "Rule: " + rule.label + " → " + rule.alloc + "%" +
      (mult !== 1 ? " × " + mult + " (volatility " + volatility + ")" : "") +
      " = " + finalAllocPct.toFixed(2) + "% margin" +
      (stock ? "" : " × " + leverage + "x leverage") +
      ". Actual allocation: " + actualAllocPct.toFixed(2) + "%.";

    // Informational account display; core allocation/P&L formulas unchanged.
    const account = $("calcAccountType").value;
    const contractSize = Number($("calcContractSize").value);
    const minLot = Number($("calcMinLot").value);
    const forexAccount = account === "mt5" || account === "xm";
    $("calcContractSettings").style.display = forexAccount ? "" : "none";

    if (forexAccount && Number.isFinite(contractSize) && contractSize > 0) {
      const lots = quantity / contractSize;
      $("calcLotSize").textContent = Number.isFinite(lots) ? lots.toFixed(6) : "--";
      if (!Number.isFinite(minLot) || minLot <= 0) {
        $("calcLotStatus").textContent = "Enter minimum lot";
      } else if (lots > 0 && lots < minLot) {
        $("calcLotStatus").textContent = "BELOW MINIMUM — verify broker";
      } else {
        $("calcLotStatus").textContent = "Estimate only — verify broker";
      }
    } else if (account === "delta") {
      $("calcLotSize").textContent = "N/A";
      $("calcLotStatus").textContent = "Check crypto contract specification";
    } else {
      $("calcLotSize").textContent = "N/A";
      $("calcLotStatus").textContent = "Shares/units; verify F&O lot size";
    }

    // -- result cards --
    $("calcAllocPct").textContent = finalAllocPct.toFixed(2) + "%";
    $("calcQuantity").textContent = fmtQty(quantity) + " units";
    $("calcMarginRequired").textContent = fmtINR(targetMarginINR);
    $("calcPositionValue").textContent = fmtNative(targetPosValueNative, ccy);
    $("calcActualInvest").textContent = fmtINR(actualMarginINR);
    $("calcLevApplied").textContent = leverage + "x";

    // -- outcomes (native currency) --
    const slLossNative = riskPerUnitNative > 0
      ? -(quantity * riskPerUnitNative) : 0;
    const t1ProfitNative = Number.isFinite(levels.t1)
      ? quantity * Math.abs(levels.t1 - levels.entry) : 0;
    const t2ProfitNative = Number.isFinite(levels.t2)
      ? quantity * Math.abs(levels.t2 - levels.entry) : 0;

    $("calcSLLoss").textContent = fmtNative(slLossNative, ccy);
    $("calcT1Profit").textContent = fmtNative(t1ProfitNative, ccy);
    $("calcT2Profit").textContent = fmtNative(t2ProfitNative, ccy);

    $("calcResultCard").classList.remove("calc-hidden");
  }

  function refreshTradeList() {
    const sel = $("calcTradeSelect");
    const active = activeTrades.filter(
      t => String(t.status || "").toUpperCase() === "ACTIVE"
    );

    sel.replaceChildren();

    if (!active.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No active trades";
      sel.appendChild(opt);
      $("calcTradeStatus").textContent = "Filhal koi ACTIVE trade nahi hai.";
      $("calcEmptyCard").classList.add("calc-show");
      $("calcDetailsCard").classList.add("calc-hidden");
      $("calcResultCard").classList.add("calc-hidden");
      $("calcLeverageCard").classList.add("calc-hidden");
      currentTrade = null;
      return;
    }

    $("calcEmptyCard").classList.remove("calc-show");

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an active trade…";
    sel.appendChild(placeholder);

    active.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent =
        String(t.symbol || "?") + " • " +
        (t.styleLabel || t.mode || "?") + " • " +
        String(t.direction || "?");
      sel.appendChild(opt);
    });

    $("calcTradeStatus").textContent =
      active.length + " active trade" + (active.length > 1 ? "s" : "") + " available.";

    // Restore saved trade selection if still active
    const saved = readSettings();
    if (saved && saved.tradeId) {
      const exists = active.some(t => t.id === saved.tradeId);
      if (exists) {
        sel.value = saved.tradeId;
        currentTrade = active.find(t => t.id === saved.tradeId) || null;
      }
    }
  }

  async function loadActiveTrades() {
    try {
      const res = await fetch("/api/signal-history?limit=500", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
      activeTrades = Array.isArray(data.history) ? data.history : [];
      refreshTradeList();
      render();
    } catch (err) {
      $("calcTradeStatus").textContent =
        "Active trades load nahi hui: " + err.message;
    }
  }

  function onTradeChange() {
    const id = $("calcTradeSelect").value;
    currentTrade = activeTrades.find(t => t.id === id) || null;
    writeSettings({ tradeId: id || null });
    render();
  }

  function init() {
    // Restore capital
    const saved = readSettings();
    if (saved && saved.capital !== undefined && saved.capital !== null && saved.capital !== "") {
      $("calcCapital").value = saved.capital;
    }
    if (saved && saved.accountType) {
      const option = $("calcAccountType").querySelector(
        'option[value="' + saved.accountType + '"]'
      );
      if (option) $("calcAccountType").value = saved.accountType;
    }
    if (saved && saved.contractSize) {
      $("calcContractSize").value = saved.contractSize;
    }
    if (saved && saved.minLot) {
      $("calcMinLot").value = saved.minLot;
    }

    // Restore leverage
    if (saved && saved.leverage !== undefined && saved.leverage !== null) {
      const lev = String(saved.leverage);
      const opt = $("calcLeverage").querySelector('option[value="' + lev + '"]');
      if (opt) $("calcLeverage").value = lev;
    }
    // Restore USD/INR rate (user-editable, persisted)
    if (saved && saved.usdInrRate !== undefined && saved.usdInrRate !== null && saved.usdInrRate !== "") {
      const r = Number(saved.usdInrRate);
      if (Number.isFinite(r) && r > 0) {
        $("calcUsdInrRate").value = saved.usdInrRate;
      }
    }

    $("calcAccountType").addEventListener("change", () => {
      writeSettings({ accountType: $("calcAccountType").value });
      render();
    });
    $("calcContractSize").addEventListener("input", () => {
      writeSettings({ contractSize: $("calcContractSize").value });
      render();
    });
    $("calcMinLot").addEventListener("input", () => {
      writeSettings({ minLot: $("calcMinLot").value });
      render();
    });
    $("calcTradeSelect").addEventListener("change", onTradeChange);
    $("calcCapital").addEventListener("input", () => {
      writeSettings({ capital: $("calcCapital").value });
      render();
    });
    $("calcLeverage").addEventListener("change", () => {
      writeSettings({ leverage: $("calcLeverage").value });
      render();
    });
    $("calcUsdInrRate").addEventListener("input", () => {
      const el = $("calcUsdInrRate");
      const v = Number(el.value);
      if (Number.isFinite(v) && v > 0) {
        writeSettings({ usdInrRate: el.value });
      }
      render();
    });
    loadActiveTrades();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
