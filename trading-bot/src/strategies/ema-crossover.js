const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { ema } = require('../utils/indicators');

/**
 * EMA Crossover Strategy
 * BUY  when fast EMA crosses above slow EMA
 * SELL when fast EMA crosses below slow EMA
 */
class EmaCrossoverStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('EMA Crossover', params);
    this.fastPeriod = params.fastPeriod || 9;
    this.slowPeriod = params.slowPeriod || 21;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < this.slowPeriod + 2) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const fastEma = ema(closes, this.fastPeriod);
    const slowEma = ema(closes, this.slowPeriod);

    const len = closes.length;
    const currFast = fastEma[len - 1];
    const prevFast = fastEma[len - 2];
    const currSlow = slowEma[len - 1];
    const prevSlow = slowEma[len - 2];

    if (currFast === null || currSlow === null || prevFast === null || prevSlow === null) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    // Bullish crossover
    if (prevFast <= prevSlow && currFast > currSlow) {
      const strength = Math.min(((currFast - currSlow) / currSlow) * 1000, 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.round(strength),
        reason: `Fast EMA(${this.fastPeriod}) crossed above Slow EMA(${this.slowPeriod})`,
      };
    }

    // Bearish crossover
    if (prevFast >= prevSlow && currFast < currSlow) {
      const strength = Math.min(((currSlow - currFast) / currSlow) * 1000, 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.round(strength),
        reason: `Fast EMA(${this.fastPeriod}) crossed below Slow EMA(${this.slowPeriod})`,
      };
    }

    return {
      signal: SIGNAL.HOLD,
      confidence: 0,
      reason: 'No crossover detected',
    };
  }
}

module.exports = EmaCrossoverStrategy;
