/**
 * LuxAlgo Heikin-Ashi Strategy (JS port of Pine Script)
 *
 * BUY  – HA close crosses above EMA trend AND RSI > 50
 * SELL – HA close crosses below EMA trend AND RSI < 50
 *
 * SL = 2 × ATR from entry price
 * TP = 4 × ATR from entry price  (2:1 reward/risk)
 */
const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { ema, rsi, atr } = require('../utils/indicators');

class LuxAlgoHAStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('LuxAlgo-HA', params);
    this.length    = params.length    || 14;   // EMA + stdev period
    this.mult      = params.mult      || 2.0;  // band multiplier
    this.rsiLength = params.rsiLength || 14;
    this.atrLength = params.atrLength || 14;
  }

  // ── Heikin-Ashi ─────────────────────────────────────────────────────────
  _heikinAshi(candles) {
    const ha = [];
    for (let i = 0; i < candles.length; i++) {
      const { open, high, low, close } = candles[i];
      const haClose = (open + high + low + close) / 4;
      const haOpen  = i === 0
        ? (open + close) / 2
        : (ha[i - 1].open + ha[i - 1].close) / 2;
      const haHigh  = Math.max(high, Math.max(haOpen, haClose));
      const haLow   = Math.min(low,  Math.min(haOpen, haClose));
      ha.push({ open: haOpen, high: haHigh, low: haLow, close: haClose });
    }
    return ha;
  }

  // ── Population stdev (matches Pine Script ta.stdev biased=true default) ─
  _stdev(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      const slice = data.slice(i - period + 1, i + 1);
      const mean  = slice.reduce((s, v) => s + v, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      result.push(Math.sqrt(variance));
    }
    return result;
  }

  // ── Main evaluation ──────────────────────────────────────────────────────
  evaluate(candles) {
    const minLen = Math.max(this.length * 4, this.rsiLength + 5, this.atrLength + 5);
    if (candles.length < minLen) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const ha       = this._heikinAshi(candles);
    const haCloses = ha.map(c => c.close);

    const trendArr = ema(haCloses, this.length);
    const stdevArr = this._stdev(haCloses, this.length);

    const closes = candles.map(c => c.close);
    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);
    const rsiArr = rsi(closes, this.rsiLength);
    const atrArr = atr(highs, lows, closes, this.atrLength);

    const n = candles.length - 1;

    const haC      = haCloses[n];
    const haCprev  = haCloses[n - 1];
    const trend    = trendArr[n];
    const trendPrv = trendArr[n - 1];
    const stdv     = stdevArr[n];
    const rsiVal   = rsiArr[n];
    const atrVal   = atrArr[n];
    const price    = closes[n];

    if (trend === null || trendPrv === null || stdv === null ||
        rsiVal === null || atrVal === null) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    // ── Signal detection (mirrors Pine Script crossover/crossunder) ────────
    const longSignal  = haCprev <= trendPrv && haC > trend  && rsiVal > 50;
    const shortSignal = haCprev >= trendPrv && haC < trend  && rsiVal < 50;

    // ── ATR-based SL / TP as fractions of current price ───────────────────
    const slPct = (2 * atrVal) / price;   // stop-loss  distance (e.g. 0.03 = 3%)
    const tpPct = (4 * atrVal) / price;   // take-profit distance (e.g. 0.06 = 6%)

    // ── Confidence: RSI distance from 50, capped at 100 ───────────────────
    const confidence = Math.min(Math.round(Math.abs(rsiVal - 50) * 2), 100);

    const upperBand = trend + this.mult * stdv;
    const lowerBand = trend - this.mult * stdv;

    if (longSignal) {
      return {
        signal: SIGNAL.BUY,
        confidence,
        reason: `HA crossed above EMA(${this.length}), RSI=${rsiVal.toFixed(1)} | upper=${upperBand.toFixed(2)} lower=${lowerBand.toFixed(2)} | SL=${(slPct*100).toFixed(2)}% TP=${(tpPct*100).toFixed(2)}%`,
        slPct,
        tpPct,
      };
    }

    if (shortSignal) {
      return {
        signal: SIGNAL.SELL,
        confidence,
        reason: `HA crossed below EMA(${this.length}), RSI=${rsiVal.toFixed(1)} | upper=${upperBand.toFixed(2)} lower=${lowerBand.toFixed(2)} | SL=${(slPct*100).toFixed(2)}% TP=${(tpPct*100).toFixed(2)}%`,
        slPct,
        tpPct,
      };
    }

    return {
      signal: SIGNAL.HOLD,
      confidence: 0,
      reason: `No signal – RSI=${rsiVal.toFixed(1)}, HA=${haC.toFixed(2)} vs trend=${trend.toFixed(2)}`,
    };
  }
}

module.exports = LuxAlgoHAStrategy;
