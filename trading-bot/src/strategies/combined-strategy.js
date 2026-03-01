const { BaseStrategy, SIGNAL } = require('./base-strategy');
const EmaCrossoverStrategy = require('./ema-crossover');
const RsiStrategy = require('./rsi-strategy');
const MacdStrategy = require('./macd-strategy');
const BollingerStrategy = require('./bollinger-strategy');

/**
 * Combined Strategy – High Win Rate Mode
 * Requires multiple strategy confirmations before entering a trade.
 * With 3/4 confirmations + trend filters on each strategy,
 * only the highest-probability setups trigger entries.
 */
class CombinedStrategy extends BaseStrategy {
  constructor(params = {}, allParams = {}) {
    super('Combined', params);
    this.minConfirmations = params.minConfirmations || 3;
    this.minConfidence = params.minConfidence || 15;

    this.strategies = [
      new EmaCrossoverStrategy(allParams.ema_crossover || {}),
      new RsiStrategy(allParams.rsi || {}),
      new MacdStrategy(allParams.macd || {}),
      new BollingerStrategy(allParams.bollinger || {}),
    ];
  }

  evaluate(candles) {
    const results = this.strategies.map((s) => ({
      name: s.name,
      ...s.evaluate(candles),
    }));

    const buySignals = results.filter((r) => r.signal === SIGNAL.BUY);
    const sellSignals = results.filter((r) => r.signal === SIGNAL.SELL);

    const buyCount = buySignals.length;
    const sellCount = sellSignals.length;

    const details = results
      .map((r) => `${r.name}: ${r.signal} (${r.confidence}%) - ${r.reason}`)
      .join(' | ');

    // Buy if enough strategies agree with sufficient confidence
    if (buyCount >= this.minConfirmations && buyCount > sellCount) {
      const medianConfidence = this._median(buySignals.map(s => s.confidence));
      // Require minimum median confidence from agreeing strategies
      if (medianConfidence < this.minConfidence) {
        return {
          signal: SIGNAL.HOLD,
          confidence: 0,
          reason: `Buy confirmed but low confidence (${medianConfidence}% < ${this.minConfidence}%) [${details}]`,
        };
      }
      return {
        signal: SIGNAL.BUY,
        confidence: medianConfidence,
        reason: `${buyCount}/${this.strategies.length} strategies agree on BUY (median conf: ${medianConfidence}%) [${details}]`,
      };
    }

    // Sell if enough strategies agree with sufficient confidence
    if (sellCount >= this.minConfirmations && sellCount > buyCount) {
      const medianConfidence = this._median(sellSignals.map(s => s.confidence));
      if (medianConfidence < this.minConfidence) {
        return {
          signal: SIGNAL.HOLD,
          confidence: 0,
          reason: `Sell confirmed but low confidence (${medianConfidence}% < ${this.minConfidence}%) [${details}]`,
        };
      }
      return {
        signal: SIGNAL.SELL,
        confidence: medianConfidence,
        reason: `${sellCount}/${this.strategies.length} strategies agree on SELL (median conf: ${medianConfidence}%) [${details}]`,
      };
    }

    return {
      signal: SIGNAL.HOLD,
      confidence: 0,
      reason: `Insufficient confirmations (buy:${buyCount} sell:${sellCount} need:${this.minConfirmations}) [${details}]`,
    };
  }

  _median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }
}

module.exports = CombinedStrategy;
