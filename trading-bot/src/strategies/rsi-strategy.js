const { BaseStrategy, SIGNAL } = require('./base-strategy');
const { rsi } = require('../utils/indicators');

/**
 * RSI Mean-Reversion Strategy
 * BUY  when RSI drops below oversold then rises back above it
 * SELL when RSI rises above overbought then drops back below it
 */
class RsiStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('RSI', params);
    this.period = params.period || 14;
    this.overbought = params.overbought || 70;
    this.oversold = params.oversold || 30;
  }

  evaluate(candles) {
    const closes = candles.map((c) => c.close);
    if (closes.length < this.period + 3) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Not enough data' };
    }

    const rsiValues = rsi(closes, this.period);
    const len = rsiValues.length;
    const curr = rsiValues[len - 1];
    const prev = rsiValues[len - 2];

    if (curr === null || prev === null) {
      return { signal: SIGNAL.HOLD, confidence: 0, reason: 'Indicator warming up' };
    }

    // Oversold bounce – buy signal
    if (prev <= this.oversold && curr > this.oversold) {
      const confidence = Math.min(Math.round((this.oversold - prev + (curr - this.oversold)) * 2), 100);
      return {
        signal: SIGNAL.BUY,
        confidence,
        reason: `RSI bounced from oversold (${prev.toFixed(1)} -> ${curr.toFixed(1)})`,
      };
    }

    // Overbought reversal – sell signal
    if (prev >= this.overbought && curr < this.overbought) {
      const confidence = Math.min(Math.round((prev - this.overbought + (this.overbought - curr)) * 2), 100);
      return {
        signal: SIGNAL.SELL,
        confidence,
        reason: `RSI dropped from overbought (${prev.toFixed(1)} -> ${curr.toFixed(1)})`,
      };
    }

    // Strong oversold zone – building buy signal
    if (curr < this.oversold) {
      return {
        signal: SIGNAL.HOLD,
        confidence: 0,
        reason: `RSI in oversold zone (${curr.toFixed(1)}), waiting for bounce`,
      };
    }

    // Strong overbought zone – building sell signal
    if (curr > this.overbought) {
      return {
        signal: SIGNAL.HOLD,
        confidence: 0,
        reason: `RSI in overbought zone (${curr.toFixed(1)}), waiting for drop`,
      };
    }

    return { signal: SIGNAL.HOLD, confidence: 0, reason: `RSI neutral (${curr.toFixed(1)})` };
  }
}

module.exports = RsiStrategy;
