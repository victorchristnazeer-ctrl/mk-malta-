const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { ema } = require('../utils/indicators');

/**
 * EMA Crossover Strategy with Trend Filter
 * BUY  when fast EMA crosses above slow EMA AND price is above trend EMA
 * SELL when fast EMA crosses below slow EMA AND price is below trend EMA
 * The trend filter prevents trading against the dominant trend.
 */
class EmaCrossoverStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('EMA Crossover', params);
    this.fastPeriod = params.fastPeriod || 9;
    this.slowPeriod = params.slowPeriod || 21;
    this.trendPeriod = params.trendPeriod || 50;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < this.trendPeriod + 2) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const fastEma = ema(closes, this.fastPeriod);
    const slowEma = ema(closes, this.slowPeriod);
    const trendEma = ema(closes, this.trendPeriod);

    const len = closes.length;
    const currFast = fastEma[len - 1];
    const prevFast = fastEma[len - 2];
    const currSlow = slowEma[len - 1];
    const prevSlow = slowEma[len - 2];
    const currTrend = trendEma[len - 1];
    const currPrice = closes[len - 1];

    if ([currFast, currSlow, prevFast, prevSlow, currTrend].some((v) => v === null)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    // Trend direction
    const aboveTrend = currPrice > currTrend;
    const belowTrend = currPrice < currTrend;

    // Bullish crossover + price above trend EMA
    if (prevFast <= prevSlow && currFast > currSlow && aboveTrend) {
      const separation = ((currFast - currSlow) / currSlow) * 1000;
      const trendStrength = ((currPrice - currTrend) / currTrend) * 100;
      const confidence = Math.min(Math.round(separation + trendStrength * 5), 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.max(confidence, 10),
        reason: `EMA(${this.fastPeriod}) crossed above EMA(${this.slowPeriod}), trend confirmed`,
      };
    }

    // Bearish crossover + price below trend EMA
    if (prevFast >= prevSlow && currFast < currSlow && belowTrend) {
      const separation = ((currSlow - currFast) / currSlow) * 1000;
      const trendStrength = ((currTrend - currPrice) / currTrend) * 100;
      const confidence = Math.min(Math.round(separation + trendStrength * 5), 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.max(confidence, 10),
        reason: `EMA(${this.fastPeriod}) crossed below EMA(${this.slowPeriod}), trend confirmed`,
      };
    }

    return {
      signal: SIGNAL.HOLD,
      confidence: 0,
      reason: 'No confirmed crossover',
    };
  }
}

module.exports = EmaCrossoverStrategy;
