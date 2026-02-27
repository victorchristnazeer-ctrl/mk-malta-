const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { macd: calcMacd } = require('../utils/indicators');

/**
 * MACD Strategy
 * BUY  when MACD line crosses above signal line (bullish momentum)
 * SELL when MACD line crosses below signal line (bearish momentum)
 */
class MacdStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('MACD', params);
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.signalPeriod = params.signalPeriod || 9;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < this.slowPeriod + this.signalPeriod + 2) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const { macd: macdLine, signal: signalLine, histogram } = calcMacd(
      closes,
      this.fastPeriod,
      this.slowPeriod,
      this.signalPeriod
    );

    const len = macdLine.length;
    const currMacd = macdLine[len - 1];
    const prevMacd = macdLine[len - 2];
    const currSignal = signalLine[len - 1];
    const prevSignal = signalLine[len - 2];
    const currHist = histogram[len - 1];

    if ([currMacd, prevMacd, currSignal, prevSignal, currHist].some((v) => v === null)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    // Bullish crossover
    if (prevMacd <= prevSignal && currMacd > currSignal) {
      const strength = Math.min(Math.abs(currHist) * 100, 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.round(strength),
        reason: `MACD crossed above signal (hist: ${currHist.toFixed(4)})`,
      };
    }

    // Bearish crossover
    if (prevMacd >= prevSignal && currMacd < currSignal) {
      const strength = Math.min(Math.abs(currHist) * 100, 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.round(strength),
        reason: `MACD crossed below signal (hist: ${currHist.toFixed(4)})`,
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
