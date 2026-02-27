const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { bollingerBands } = require('../utils/indicators');

/**
 * Bollinger Bands Mean-Reversion Strategy
 * BUY  when price touches or breaks below lower band then reverses up
 * SELL when price touches or breaks above upper band then reverses down
 */
class BollingerStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('Bollinger Bands', params);
    this.period = params.period || 20;
    this.stdDev = params.stdDev || 2;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < this.period + 2) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const { upper, middle, lower } = bollingerBands(closes, this.period, this.stdDev);
    const len = closes.length;

    const currClose = closes[len - 1];
    const prevClose = closes[len - 2];
    const currUpper = upper[len - 1];
    const currLower = lower[len - 1];
    const currMiddle = middle[len - 1];
    const prevLower = lower[len - 2];
    const prevUpper = upper[len - 2];

    if ([currUpper, currLower, currMiddle, prevLower, prevUpper].some((v) => v === null)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    const bandwidth = currUpper - currLower;

    // Price bounced off lower band
    if (prevClose <= prevLower && currClose > currLower) {
      const confidence = Math.min(Math.round(((currLower - prevClose + currClose - currLower) / bandwidth) * 100), 100);
      return {
        signal: SIGNAL.BUY,
        confidence,
        reason: `Price bounced off lower Bollinger Band`,
      };
    }

    // Price rejected from upper band
    if (prevClose >= prevUpper && currClose < currUpper) {
      const confidence = Math.min(Math.round(((prevClose - prevUpper + currUpper - currClose) / bandwidth) * 100), 100);
      return {
        signal: SIGNAL.SELL,
        confidence,
        reason: `Price rejected from upper Bollinger Band`,
      };
    }

    // Price below lower band — potential reversal zone
    if (currClose < currLower) {
      return {
        signal: SIGNAL.HOLD,
        confidence: 0,
        reason: `Price below lower band, waiting for reversal`,
      };
    }

    // Price above upper band — potential reversal zone
    if (currClose > currUpper) {
      return {
        signal: SIGNAL.HOLD,
        confidence: 0,
        reason: `Price above upper band, waiting for reversal`,
      };
    }

    const posInBand = ((currClose - currLower) / bandwidth) * 100;
    return {
      signal: SIGNAL.HOLD,
      confidence: 0,
      reason: `Price at ${posInBand.toFixed(0)}% of Bollinger Band`,
    };
  }
}

module.exports = BollingerStrategy;
