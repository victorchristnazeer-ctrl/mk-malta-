/**
 * Trading Engine – the live/paper-trading loop.
 * Polls for new candles, evaluates the strategy, and manages positions.
 */
const Portfolio = require('./portfolio');
const RiskManager = require('./risk-manager');
const DataFeed = require('./data-feed');
const { SIGNAL } = require('../strategies/base-strategy');

class TradingEngine {
  constructor(config, strategy, logger) {
    this.config = config;
    this.strategy = strategy;
    this.log = logger;
    this.portfolio = new Portfolio(config.initialBalance, logger);
    this.riskManager = new RiskManager(config, logger);
    this.candles = [];
    this.running = false;
    this.tickCount = 0;
  }

  /**
   * Start the trading loop.
   */
  async start() {
    this.running = true;
    this.log.info(`\n${'='.repeat(60)}`);
    this.log.info(`TRADING BOT STARTED`);
    this.log.info(`Mode: ${this.config.paperTrading ? 'PAPER TRADING' : 'LIVE (simulated)'}`);
    this.log.info(`Strategy: ${this.strategy.name}`);
    this.log.info(`Symbol: ${this.config.symbol}`);
    this.log.info(`Timeframe: ${this.config.timeframe}`);
    this.log.info(`Initial Balance: $${this.config.initialBalance}`);
    this.log.info(`${'='.repeat(60)}\n`);

    // Seed with initial candles
    this.candles = DataFeed.generateTrendingMarket({
      startPrice: 40000,
      numCandles: 100,
    });

    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.log.error('Tick error:', err.message);
      }
      await this._sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Process one tick (one candle period).
   */
  async tick() {
    this.tickCount++;

    // Generate a new candle (in production, fetch from exchange)
    const lastCandle = this.candles[this.candles.length - 1];
    const lastPrice = lastCandle.close;
    const volatility = 0.01 + Math.random() * 0.01;
    const drift = (Math.random() - 0.48) * 0.003; // slight positive drift
    const newPrice = lastPrice * (1 + drift + (Math.random() - 0.5) * volatility);

    const newCandle = {
      time: new Date().toISOString(),
      open: lastPrice,
      high: Math.max(lastPrice, newPrice) * (1 + Math.random() * 0.002),
      low: Math.min(lastPrice, newPrice) * (1 - Math.random() * 0.002),
      close: parseFloat(newPrice.toFixed(2)),
      volume: parseFloat((200 + Math.random() * 800).toFixed(2)),
    };
    this.candles.push(newCandle);

    // Keep a rolling window
    if (this.candles.length > 500) this.candles.shift();

    const currentPrice = newCandle.close;

    // Manage existing positions
    for (const pos of [...this.portfolio.positions]) {
      pos.trailingStop = this.riskManager.updateTrailingStop(
        currentPrice, pos.trailingStop, pos.side
      );

      const trailingHit = pos.side === 'BUY'
        ? currentPrice <= pos.trailingStop
        : currentPrice >= pos.trailingStop;

      if (trailingHit && pos.trailingStop !== pos.stopLoss) {
        const result = this.portfolio.closePosition(pos.id, currentPrice, 'Trailing stop hit');
        if (result) this.riskManager.recordPnL(result.pnl, this.portfolio.balance);
        continue;
      }

      const exit = this.riskManager.checkExitConditions(pos, currentPrice);
      if (exit.shouldClose) {
        const result = this.portfolio.closePosition(pos.id, currentPrice, exit.reason);
        if (result) this.riskManager.recordPnL(result.pnl, this.portfolio.balance);
      }
    }

    // Check risk manager
    this.riskManager.checkDayRollover();
    if (this.riskManager.isHalted()) {
      if (this.tickCount % 10 === 0) {
        this.log.warn('Trading halted by risk manager');
      }
      return;
    }

    // Evaluate strategy
    const evaluation = this.strategy.evaluate(this.candles);

    if (evaluation.signal !== SIGNAL.HOLD) {
      this.log.debug(`Signal: ${evaluation.signal} (confidence: ${evaluation.confidence}%) - ${evaluation.reason}`);
    }

    if (evaluation.signal === SIGNAL.HOLD) return;

    // Minimum confidence filter
    const minConf = this.config.risk.minConfidence || 0;
    if (evaluation.confidence < minConf) return;

    if (!this.riskManager.canOpenPosition(this.portfolio.positions.length)) return;

    const side = evaluation.signal;
    const { quantity } = this.riskManager.calculatePositionSize(this.portfolio.balance, currentPrice);
    if (quantity <= 0) return;

    const stopLoss = this.riskManager.getStopLoss(currentPrice, side);
    const takeProfit = this.riskManager.getTakeProfit(currentPrice, side);

    if (!this.riskManager.meetsRiskReward(currentPrice, stopLoss, takeProfit)) return;

    this.portfolio.openPosition({
      side,
      price: currentPrice,
      quantity,
      stopLoss,
      takeProfit,
      reason: evaluation.reason,
    });

    // Print summary periodically
    if (this.tickCount % 20 === 0) {
      this.printStatus(currentPrice);
    }
  }

  /**
   * Print current status.
   */
  printStatus(currentPrice) {
    const summary = this.portfolio.getSummary(currentPrice);
    this.log.info(`\n--- Status (tick ${this.tickCount}) ---`);
    this.log.info(`  Balance: $${this.portfolio.balance.toFixed(2)} | Total Value: $${summary.totalValue}`);
    this.log.info(`  Return: ${summary.totalReturn} | Win Rate: ${summary.winRate}`);
    this.log.info(`  Trades: ${summary.totalTrades} | Open: ${summary.openPositions} | Max DD: ${summary.maxDrawdown}`);
    this.log.info(`---\n`);
  }

  /**
   * Stop the trading loop.
   */
  stop() {
    this.running = false;
    this.log.info('Trading bot stopping...');
    const lastPrice = this.candles[this.candles.length - 1]?.close || 0;
    this.printStatus(lastPrice);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = TradingEngine;
