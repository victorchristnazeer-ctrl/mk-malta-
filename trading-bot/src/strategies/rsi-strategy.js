const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { rsi, ema } = require('../utils/indicators');

/**
 * RSI Mean-Reversion Strategy
 * BUY  when RSI bounces from deeply oversold with momentum confirmation
 * SELL when RSI drops from deeply overbought with momentum confirmation
 * Only trades extreme RSI levels for higher-quality signals.
 */
class RsiStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('RSI', params);
    this.period = params.period || 14;
    this.overbought = params.overbought || 70;
    this.oversold = params.oversold || 30;
    this.trendPeriod = params.trendPeriod || 50;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < Math.max(this.period + 5, this.trendPeriod + 2)) {
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
    const prevPrice = closes[len - 2];

    if (curr === null || prev === null || prev2 === null || currTrend === null) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    const trendDist = ((currPrice - currTrend) / currTrend) * 100;

    // Only trade deeply oversold/overbought levels for quality signals
    const deepOversold = this.oversold - 5;  // e.g. 25
    const deepOverbought = this.overbought + 5;  // e.g. 75

    // Oversold bounce: must have been deeply oversold and now recovering
    // Two-bar confirmation: prev2 or prev was deeply oversold, curr is above oversold
    const wasDeepOversold = prev2 <= deepOversold || prev <= deepOversold;
    const crossingUp = prev <= this.oversold && curr > this.oversold;

    if (wasDeepOversold && crossingUp && currPrice > prevPrice) {
      const depth = this.oversold - Math.min(prev, prev2);
      const bounce = curr - this.oversold;
      let confidence = Math.min(Math.round((depth + bounce) * 4), 100);
      // Boost if price is near or above trend (not in a strong downtrend)
      if (trendDist > -3) confidence = Math.min(confidence + 20, 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.max(confidence, 20),
        reason: `RSI bounced from oversold (${prev.toFixed(1)}->${curr.toFixed(1)}), price recovering`,
      };
    }

    // Overbought reversal: must have been deeply overbought and now declining
    const wasDeepOverbought = prev2 >= deepOverbought || prev >= deepOverbought;
    const crossingDown = prev >= this.overbought && curr < this.overbought;

    if (wasDeepOverbought && crossingDown && currPrice < prevPrice) {
      const depth = Math.max(prev, prev2) - this.overbought;
      const drop = this.overbought - curr;
      let confidence = Math.min(Math.round((depth + drop) * 4), 100);
      // Boost if price is near or below trend (not in a strong uptrend)
      if (trendDist < 3) confidence = Math.min(confidence + 20, 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.max(confidence, 20),
        reason: `RSI dropped from overbought (${prev.toFixed(1)}->${curr.toFixed(1)}), price declining`,
      };
    }

    return { signal: SIGNAL.HOLD, confidence: 0, reason: `RSI neutral (${curr.toFixed(1)})` };
  }
}

module.exports = RsiStrategy;
