/**
 * Base strategy – all strategies extend this.
 * Subclasses must implement `evaluate(candles)` and return a signal object.
 */

// Signal types
const SIGNAL = {
  BUY: 'BUY',
  SELL: 'SELL',
  HOLD: 'HOLD',
};

class BaseStrategy {
  constructor(name, params = {}) {
    this.name = name;
    this.params = params;
  }

  /**
   * Evaluate candles and return a signal.
   * @param {Array} candles - Array of { time, open, high, low, close, volume }
   * @returns {{ signal: string, confidence: number, reason: string }}
   */
  evaluate(_candles) {
    throw new Error(`${this.name}: evaluate() not implemented`);
  }
}

module.exports = { BaseStrategy, SIGNAL };
