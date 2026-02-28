const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { bollingerBands, ema } = require('../utils/indicators');

/**
 * Bollinger Bands Mean-Reversion Strategy
 * BUY  when price bounces off lower band with momentum confirmation
 * SELL when price rejects upper band with momentum confirmation
 * Uses middle band and trend as quality filters rather than hard gates.
 */
class BollingerStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('Bollinger Bands', params);
    this.period = params.period || 20;
    this.stdDev = params.stdDev || 2;
    this.trendPeriod = params.trendPeriod || 50;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < Math.max(this.period + 3, this.trendPeriod + 2)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const { upper, middle, lower } = bollingerBands(closes, this.period, this.stdDev);
    const trendEma = ema(closes, this.trendPeriod);
    const len = closes.length;

    const currClose = closes[len - 1];
    const prevClose = closes[len - 2];
    const prev2Close = closes[len - 3];
    const currUpper = upper[len - 1];
    const currLower = lower[len - 1];
    const currMiddle = middle[len - 1];
    const prevLower = lower[len - 2];
    const prevUpper = upper[len - 2];
    const prev2Lower = lower[len - 3];
    const prev2Upper = upper[len - 3];
    const currTrend = trendEma[len - 1];

    if ([currUpper, currLower, currMiddle, prevLower, prevUpper, prev2Lower, prev2Upper, currTrend].some((v) => v === null)) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    const bandwidth = currUpper - currLower;

    // 2-candle lower band bounce: touched lower band, now bouncing up
    const lowerBandTouch = prev2Close <= prev2Lower || prevClose <= prevLower;
    const bouncingUp = currClose > prevClose && currClose > currLower;

    if (lowerBandTouch && bouncingUp) {
      const distFromLow = (currClose - currLower) / bandwidth;
      let confidence = Math.min(Math.round(distFromLow * 80 + 20), 100);
      // Boost confidence if price is moving back toward middle band (mean-reversion working)
      if (currClose < currMiddle) confidence = Math.min(confidence + 10, 100);
      // Boost if long-term trend is not strongly down
      const trendDist = ((currClose - currTrend) / currTrend) * 100;
      if (trendDist > -3) confidence = Math.min(confidence + 10, 100);
      return {
        signal: SIGNAL.BUY,
        confidence: Math.max(confidence, 15),
        reason: `Bollinger lower band bounce confirmed`,
      };
    }

    // 2-candle upper band rejection: touched upper band, now dropping
    const upperBandTouch = prev2Close >= prev2Upper || prevClose >= prevUpper;
    const droppingDown = currClose < prevClose && currClose < currUpper;

    if (upperBandTouch && droppingDown) {
      const distFromHigh = (currUpper - currClose) / bandwidth;
      let confidence = Math.min(Math.round(distFromHigh * 80 + 20), 100);
      // Boost confidence if price is moving back toward middle band
      if (currClose > currMiddle) confidence = Math.min(confidence + 10, 100);
      // Boost if long-term trend is not strongly up
      const trendDist = ((currClose - currTrend) / currTrend) * 100;
      if (trendDist < 3) confidence = Math.min(confidence + 10, 100);
      return {
        signal: SIGNAL.SELL,
        confidence: Math.max(confidence, 15),
        reason: `Bollinger upper band rejection confirmed`,
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
