const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { macd: calcMacd, ema } = require('../utils/indicators');

/**
 * MACD Strategy with Histogram Confirmation
 * BUY  when MACD crosses above signal with growing histogram momentum
 * SELL when MACD crosses below signal with falling histogram momentum
 * Trend is used as a confidence booster, not a hard gate.
 */
class MacdStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('MACD', params);
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.signalPeriod = params.signalPeriod || 9;
    this.trendPeriod = params.trendPeriod || 50;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < Math.max(this.slowPeriod + this.signalPeriod + 2, this.trendPeriod + 2)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const { macd: macdLine, signal: signalLine, histogram } = calcMacd(
      closes,
      this.fastPeriod,
      this.slowPeriod,
      this.signalPeriod
    );
    const trendEma = ema(closes, this.trendPeriod);

    const len = macdLine.length;
    const currMacd = macdLine[len - 1];
    const prevMacd = macdLine[len - 2];
    const currSignal = signalLine[len - 1];
    const prevSignal = signalLine[len - 2];
    const currHist = histogram[len - 1];
    const prevHist = histogram[len - 2];
    const currTrend = trendEma[len - 1];
    const currPrice = closes[len - 1];

    if ([currMacd, prevMacd, currSignal, prevSignal, currHist, prevHist, currTrend].some((v) => v === null)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    const histGrowing = currHist > prevHist;
    const histFalling = currHist < prevHist;
    const trendDist = ((currPrice - currTrend) / currTrend) * 100;

    // Bullish crossover + growing histogram
    if (prevMacd <= prevSignal && currMacd > currSignal && histGrowing) {
      const strength = Math.abs(currHist) * 100;
      let confidence = Math.min(Math.round(strength + 15), 100);
      // Boost confidence when aligned with trend
      if (trendDist > 0) confidence = Math.min(confidence + 15, 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.max(confidence, 15),
        reason: `MACD bullish crossover, momentum growing (hist: ${currHist.toFixed(4)})`,
      };
    }

    // Bearish crossover + falling histogram
    if (prevMacd >= prevSignal && currMacd < currSignal && histFalling) {
      const strength = Math.abs(currHist) * 100;
      let confidence = Math.min(Math.round(strength + 15), 100);
      // Boost confidence when aligned with trend
      if (trendDist < 0) confidence = Math.min(confidence + 15, 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.max(confidence, 15),
        reason: `MACD bearish crossover, momentum falling (hist: ${currHist.toFixed(4)})`,
      };
    }

    return {
      signal: SIGNAL.HOLD,
      confidence: 0,
      reason: `MACD neutral (hist: ${currHist.toFixed(4)})`,
    };
  }
}

module.exports = MacdStrategy;
