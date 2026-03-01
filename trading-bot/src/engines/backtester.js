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
    // Trading cost simulation (basis points)
    const costs = config.tradingCosts || {};
    this.slippageBps = costs.slippageBps || 3;        // 3 bps slippage per side
    this.spreadBps = costs.spreadBps || 2;             // 2 bps half-spread
    this.commissionBps = costs.commissionBps || 10;    // 10 bps (0.1%) Binance taker fee
    this.stopSlippageBps = costs.stopSlippageBps || 8; // extra slippage on stop fills
  }

  /**
   * Apply trading costs to an entry price (worse fill).
   */
  _applyEntryCost(price, side) {
    const totalBps = this.slippageBps + this.spreadBps + this.commissionBps;
    const costMult = totalBps / 10000;
    return side === 'BUY'
      ? price * (1 + costMult)   // pay more when buying
      : price * (1 - costMult);  // receive less when selling
  }

  /**
   * Apply trading costs to an exit price (worse fill).
   */
  _applyExitCost(price, side, isStopLoss = false) {
    const extra = isStopLoss ? this.stopSlippageBps : 0;
    const totalBps = this.slippageBps + this.spreadBps + this.commissionBps + extra;
    const costMult = totalBps / 10000;
    return side === 'BUY'
      ? price * (1 - costMult)   // receive less when closing a long
      : price * (1 + costMult);  // pay more when closing a short
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

    const maxBarsInTrade = this.config.risk.maxBarsInTrade || 100;

    for (let i = lookback; i < candles.length; i++) {
      const window = candles.slice(0, i + 1);
      const currentCandle = candles[i];
      const currentPrice = currentCandle.close;

      // Check & close existing positions
      for (const pos of [...portfolio.positions]) {
        // Stale position check: auto-close if held too long without movement
        const barsHeld = (pos._entryBar !== undefined) ? i - pos._entryBar : 0;
        if (barsHeld >= maxBarsInTrade) {
          const exitPrice = this._applyExitCost(currentPrice, pos.side, false);
          const result = portfolio.closePosition(pos.id, exitPrice, `Stale position (${barsHeld} bars)`, currentCandle.time);
          if (result) riskManager.recordPnL(result.pnl, portfolio.getTotalValue(currentPrice));
          continue;
        }

        // Profit-taking tiers: close 50% at 1.5x risk (partial take-profit)
        if (!pos._partialTaken && pos.side === 'BUY') {
          const partialTP = pos.entryPrice * (1 + (this.config.risk.takeProfitPct / 100) * 0.5);
          if (currentPrice >= partialTP) {
            const halfQty = pos.quantity * 0.5;
            const exitPrice = this._applyExitCost(currentPrice, pos.side, false);
            const partialPnl = (exitPrice - pos.entryPrice) * halfQty;
            portfolio.balance += pos.entryPrice * halfQty + partialPnl;
            pos.quantity -= halfQty;
            pos.value = pos.entryPrice * pos.quantity;
            pos._partialTaken = true;
            // Tighten stop to breakeven after partial take
            pos.stopLoss = pos.entryPrice;
            pos.trailingStop = Math.max(pos.trailingStop, pos.entryPrice);
            this.log.debug(`Partial profit taken: 50% closed at ${currentPrice.toFixed(2)}, stop moved to breakeven`);
          }
        } else if (!pos._partialTaken && pos.side === 'SELL') {
          const partialTP = pos.entryPrice * (1 - (this.config.risk.takeProfitPct / 100) * 0.5);
          if (currentPrice <= partialTP) {
            const halfQty = pos.quantity * 0.5;
            const exitPrice = this._applyExitCost(currentPrice, pos.side, false);
            const partialPnl = (pos.entryPrice - exitPrice) * halfQty;
            portfolio.balance += pos.entryPrice * halfQty + partialPnl;
            pos.quantity -= halfQty;
            pos.value = pos.entryPrice * pos.quantity;
            pos._partialTaken = true;
            pos.stopLoss = pos.entryPrice;
            pos.trailingStop = Math.min(pos.trailingStop, pos.entryPrice);
            this.log.debug(`Partial profit taken: 50% closed at ${currentPrice.toFixed(2)}, stop moved to breakeven`);
          }
        }

        // Update trailing stop
        pos.trailingStop = riskManager.updateTrailingStop(
          currentPrice, pos.trailingStop, pos.side
        );

        // Check exit on trailing stop
        const trailingHit = pos.side === 'BUY'
          ? currentPrice <= pos.trailingStop
          : currentPrice >= pos.trailingStop;

        if (trailingHit && pos.trailingStop !== pos.stopLoss) {
          const exitPrice = this._applyExitCost(currentPrice, pos.side, false);
          const result = portfolio.closePosition(pos.id, exitPrice, 'Trailing stop hit', currentCandle.time);
          if (result) riskManager.recordPnL(result.pnl, portfolio.getTotalValue(currentPrice));
          continue;
        }

        // Check stop-loss / take-profit
        const exit = riskManager.checkExitConditions(pos, currentPrice);
        if (exit.shouldClose) {
          const isStop = exit.reason === 'Stop-loss hit';
          const exitPrice = this._applyExitCost(currentPrice, pos.side, isStop);
          const result = portfolio.closePosition(pos.id, exitPrice, exit.reason, currentCandle.time);
          if (result) riskManager.recordPnL(result.pnl, portfolio.getTotalValue(currentPrice));
        }
      }

      // Check if risk manager allows new positions
      riskManager.checkDayRollover(portfolio.getTotalValue(currentPrice));
      if (riskManager.isHalted()) continue;
      if (!riskManager.canOpenPosition(portfolio.positions.length)) continue;

      // Evaluate strategy
      const evaluation = this.strategy.evaluate(window);
      if (evaluation.signal === SIGNAL.HOLD) continue;

      // Minimum confidence filter – skip low-quality signals
      const minConf = this.config.risk.minConfidence || 0;
      if (evaluation.confidence < minConf) continue;

      const side = evaluation.signal;
      const { quantity } = riskManager.calculatePositionSize(portfolio.balance, currentPrice, window);
      if (quantity <= 0) continue;

      const stopLoss = riskManager.getStopLoss(currentPrice, side);
      const takeProfit = riskManager.getTakeProfit(currentPrice, side);

      // Check risk/reward
      if (!riskManager.meetsRiskReward(currentPrice, stopLoss, takeProfit)) {
        this.log.debug(`Skipping trade: risk/reward ratio not met`);
        continue;
      }

      // Apply slippage/spread/commission to entry price
      const entryPrice = this._applyEntryCost(currentPrice, side);

      const newPos = portfolio.openPosition({
        side,
        price: entryPrice,
        quantity,
        stopLoss,
        takeProfit,
        reason: evaluation.reason,
        time: currentCandle.time,
      });
      if (newPos) newPos._entryBar = i;
    }

    // Close any remaining positions at last price (with exit costs)
    const lastPrice = candles[candles.length - 1].close;
    for (const pos of [...portfolio.positions]) {
      const exitPrice = this._applyExitCost(lastPrice, pos.side, false);
      const result = portfolio.closePosition(pos.id, exitPrice, 'End of backtest', candles[candles.length - 1].time);
      if (result) riskManager.recordPnL(result.pnl, portfolio.getTotalValue(lastPrice));
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
