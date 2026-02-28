/**
 * Backtester – simulates the trading bot against historical data.
 */
const Portfolio = require('./portfolio');
const RiskManager = require('./risk-manager');
const { SIGNAL } = require('../strategies/base-strategy');

class Backtester {
  constructor(config, strategy, logger) {
    this.config = config;
    this.strategy = strategy;
    this.log = logger;
  }

  /**
   * Run a backtest on the given candle data.
   * @param {Array} candles – full OHLCV candle array
   * @param {number} lookback – how many candles the strategy needs to warm up
   * @returns {object} – performance summary + trade list
   */
  run(candles, lookback = 50) {
    const portfolio = new Portfolio(this.config.initialBalance, this.log);
    const riskManager = new RiskManager(this.config, this.log);

    this.log.info(`\n${'='.repeat(60)}`);
    this.log.info(`BACKTEST START`);
    this.log.info(`Strategy: ${this.strategy.name}`);
    this.log.info(`Symbol: ${this.config.symbol}`);
    this.log.info(`Period: ${candles[0].time} to ${candles[candles.length - 1].time}`);
    this.log.info(`Candles: ${candles.length} | Initial balance: $${this.config.initialBalance}`);
    this.log.info(`${'='.repeat(60)}\n`);

    for (let i = lookback; i < candles.length; i++) {
      const window = candles.slice(0, i + 1);
      const currentCandle = candles[i];
      const currentPrice = currentCandle.close;

      // Check & close existing positions
      for (const pos of [...portfolio.positions]) {
        // Update trailing stop
        pos.trailingStop = riskManager.updateTrailingStop(
          currentPrice, pos.trailingStop, pos.side
        );

        // Check exit on trailing stop
        const trailingHit = pos.side === 'BUY'
          ? currentPrice <= pos.trailingStop
          : currentPrice >= pos.trailingStop;

        if (trailingHit && pos.trailingStop !== pos.stopLoss) {
          const result = portfolio.closePosition(pos.id, currentPrice, 'Trailing stop hit', currentCandle.time);
          if (result) riskManager.recordPnL(result.pnl, portfolio.balance);
          continue;
        }

        // Check stop-loss / take-profit
        const exit = riskManager.checkExitConditions(pos, currentPrice);
        if (exit.shouldClose) {
          const result = portfolio.closePosition(pos.id, currentPrice, exit.reason, currentCandle.time);
          if (result) riskManager.recordPnL(result.pnl, portfolio.balance);
        }
      }

      // Check if risk manager allows new positions
      riskManager.checkDayRollover();
      if (riskManager.isHalted()) continue;
      if (!riskManager.canOpenPosition(portfolio.positions.length)) continue;

      // Evaluate strategy
      const evaluation = this.strategy.evaluate(window);
      if (evaluation.signal === SIGNAL.HOLD) continue;

      // Minimum confidence filter – skip low-quality signals
      const minConf = this.config.risk.minConfidence || 0;
      if (evaluation.confidence < minConf) continue;

      const side = evaluation.signal;
      const { quantity } = riskManager.calculatePositionSize(portfolio.balance, currentPrice);
      if (quantity <= 0) continue;

      const stopLoss = riskManager.getStopLoss(currentPrice, side);
      const takeProfit = riskManager.getTakeProfit(currentPrice, side);

      // Check risk/reward
      if (!riskManager.meetsRiskReward(currentPrice, stopLoss, takeProfit)) {
        this.log.debug(`Skipping trade: risk/reward ratio not met`);
        continue;
      }

      portfolio.openPosition({
        side,
        price: currentPrice,
        quantity,
        stopLoss,
        takeProfit,
        reason: evaluation.reason,
        time: currentCandle.time,
      });
    }

    // Close any remaining positions at last price
    const lastPrice = candles[candles.length - 1].close;
    for (const pos of [...portfolio.positions]) {
      const result = portfolio.closePosition(pos.id, lastPrice, 'End of backtest', candles[candles.length - 1].time);
      if (result) riskManager.recordPnL(result.pnl, portfolio.balance);
    }

    const summary = portfolio.getSummary(lastPrice);

    this.log.info(`\n${'='.repeat(60)}`);
    this.log.info(`BACKTEST RESULTS`);
    this.log.info(`${'='.repeat(60)}`);
    Object.entries(summary).forEach(([key, val]) => {
      this.log.info(`  ${key.padEnd(20)}: ${val}`);
    });
    this.log.info(`${'='.repeat(60)}\n`);

    return {
      summary,
      trades: portfolio.tradeHistory,
    };
  }
}

module.exports = Backtester;
