const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { macd: calcMacd, ema } = require('../utils/indicators');

/**
 * MACD Strategy with Trend Filter and Histogram Confirmation
 * BUY  when MACD crosses above signal, histogram is growing, AND trend is up
 * SELL when MACD crosses below signal, histogram is falling, AND trend is down
 * Additional: requires histogram to confirm momentum direction over 2 bars.
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

    const aboveTrend = currPrice > currTrend;
    const belowTrend = currPrice < currTrend;
    const histGrowing = currHist > prevHist;
    const histFalling = currHist < prevHist;

    // Bullish crossover + growing histogram + above trend
    if (prevMacd <= prevSignal && currMacd > currSignal && histGrowing && aboveTrend) {
      const strength = Math.abs(currHist) * 100;
      const trendBonus = ((currPrice - currTrend) / currTrend) * 200;
      const confidence = Math.min(Math.round(strength + trendBonus), 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.max(confidence, 15),
        reason: `MACD bullish crossover, momentum growing, uptrend (hist: ${currHist.toFixed(4)})`,
      };
    }

    // Bearish crossover + falling histogram + below trend
    if (prevMacd >= prevSignal && currMacd < currSignal && histFalling && belowTrend) {
      const strength = Math.abs(currHist) * 100;
      const trendBonus = ((currTrend - currPrice) / currTrend) * 200;
      const confidence = Math.min(Math.round(strength + trendBonus), 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.max(confidence, 15),
        reason: `MACD bearish crossover, momentum falling, downtrend (hist: ${currHist.toFixed(4)})`,
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
