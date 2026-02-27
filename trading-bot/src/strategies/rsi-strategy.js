const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { rsi, ema } = require('../utils/indicators');

/**
 * RSI Mean-Reversion Strategy with Trend Filter
 * BUY  when RSI bounces from extreme oversold AND trend is up
 * SELL when RSI drops from extreme overbought AND trend is down
 * Stricter thresholds + trend confirmation = fewer but higher-quality signals.
 */
class RsiStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('RSI', params);
    this.period = params.period || 14;
    this.overbought = params.overbought || 75;
    this.oversold = params.oversold || 25;
    this.trendPeriod = params.trendPeriod || 50;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < Math.max(this.period + 3, this.trendPeriod + 2)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const rsiValues = rsi(closes, this.period);
    const trendEma = ema(closes, this.trendPeriod);

    const len = rsiValues.length;
    const curr = rsiValues[len - 1];
    const prev = rsiValues[len - 2];
    const prev2 = rsiValues[len - 3];
    const currTrend = trendEma[len - 1];
    const currPrice = closes[len - 1];

    if (curr === null || prev === null || prev2 === null || currTrend === null) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    const aboveTrend = currPrice > currTrend;
    const belowTrend = currPrice < currTrend;

    // Oversold bounce with trend confirmation
    // Requires: was deeply oversold, now recovering, AND price above trend
    if (prev <= this.oversold && curr > this.oversold && aboveTrend) {
      const depth = this.oversold - Math.min(prev, prev2);
      const bounce = curr - this.oversold;
      const confidence = Math.min(Math.round((depth + bounce) * 3), 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.max(confidence, 15),
        reason: `RSI bounced from oversold (${prev.toFixed(1)}->${curr.toFixed(1)}), uptrend confirmed`,
      };
    }

    // Overbought reversal with trend confirmation
    if (prev >= this.overbought && curr < this.overbought && belowTrend) {
      const depth = Math.max(prev, prev2) - this.overbought;
      const drop = this.overbought - curr;
      const confidence = Math.min(Math.round((depth + drop) * 3), 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.max(confidence, 15),
        reason: `RSI dropped from overbought (${prev.toFixed(1)}->${curr.toFixed(1)}), downtrend confirmed`,
      };
    }

    return { signal: SIGNAL.HOLD, confidence: 0, reason: `RSI neutral (${curr.toFixed(1)})` };
  }
}

module.exports = RsiStrategy;
