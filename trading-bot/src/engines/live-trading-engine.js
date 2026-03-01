/**
 * Live Trading Engine – connects to Binance for real market data and order execution.
 *
 * For PAPER mode:  fetches real candles from Binance (public API, no key needed)
 *                  but simulates orders locally – zero financial risk.
 *
 * For LIVE mode:   fetches real candles AND places real orders via authenticated API.
 */
const Portfolio = require('./portfolio');
const RiskManager = require('./risk-manager');
const BinanceClient = require('./binance-client');
const { SIGNAL } = require('../strategies/base-strategy');

class LiveTradingEngine {
  constructor(config, strategy, logger) {
    this.config = config;
    this.strategy = strategy;
    this.log = logger;
    this.portfolio = new Portfolio(config.initialBalance, logger);
    this.riskManager = new RiskManager(config, logger);
    this.candles = [];
    this.running = false;
    this.tickCount = 0;
    this.paperMode = config.paperTrading;

    // Binance symbol format: no slash (e.g., BTCUSDT)
    this.symbol = (config.symbol || 'BTC/USDT').replace('/', '');

    // Map timeframe to Binance interval strings
    this.interval = config.timeframe || '1h';

    // Exchange client – used for data in both modes, orders only in live mode
    this.client = new BinanceClient({
      apiKey: config.exchange?.apiKey || '',
      apiSecret: config.exchange?.apiSecret || '',
      testnet: config.exchange?.testnet || false,
    }, logger);
  }

  /**
   * Start the live trading loop.
   */
  async start() {
    this.running = true;

    this.log.info(`\n${'='.repeat(60)}`);
    this.log.info('LIVE TRADING BOT STARTED');
    this.log.info(`Mode: ${this.paperMode ? 'PAPER TRADING (simulated orders, real data)' : 'LIVE TRADING (real money!)'}`);
    this.log.info(`Strategy: ${this.strategy.name}`);
    this.log.info(`Symbol: ${this.symbol}`);
    this.log.info(`Timeframe: ${this.interval}`);
    this.log.info(`Initial Balance: $${this.config.initialBalance}`);
    if (!this.paperMode) {
      this.log.warn('*** LIVE MODE – REAL ORDERS WILL BE PLACED ***');
    }
    this.log.info(`${'='.repeat(60)}\n`);

    // Fetch initial historical candles
    try {
      this.log.info('Fetching historical candles from Binance...');
      this.candles = await this.client.getCandles(this.symbol, this.interval, 200);
      this.log.info(`Loaded ${this.candles.length} historical candles`);
      this.log.info(`Latest price: $${this.candles[this.candles.length - 1].close}`);
    } catch (err) {
      this.log.error(`Failed to fetch initial candles: ${err.message}`);
      this.log.info('Retrying in 5 seconds...');
      await this._sleep(5000);
      try {
        this.candles = await this.client.getCandles(this.symbol, this.interval, 200);
        this.log.info(`Loaded ${this.candles.length} historical candles (retry)`);
      } catch (retryErr) {
        this.log.error(`Retry failed: ${retryErr.message}`);
        throw new Error('Cannot start bot without market data. Check your internet connection.');
      }
    }

    // If live mode, verify API keys and show balance
    if (!this.paperMode) {
      try {
        const balances = await this.client.getBalance();
        const quoteAsset = this.symbol.replace(/BTC|ETH|BNB|SOL|XRP|ADA|DOT|DOGE/, '');
        const quoteBalance = balances[quoteAsset] || { free: 0, total: 0 };
        this.log.info(`Exchange ${quoteAsset} balance: ${quoteBalance.free} free / ${quoteBalance.total} total`);
      } catch (err) {
        this.log.error(`API key verification failed: ${err.message}`);
        throw new Error('Cannot start live trading without valid API keys.');
      }
    }

    // Main trading loop
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.log.error(`Tick error: ${err.message}`);
      }
      await this._sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Process one tick – fetch latest candle, evaluate, trade.
   */
  async tick() {
    this.tickCount++;

    // Fetch latest candles from Binance
    try {
      const latest = await this.client.getCandles(this.symbol, this.interval, 5);
      if (latest.length > 0) {
        // Merge new candles (avoid duplicates by checking timestamps)
        for (const candle of latest) {
          const exists = this.candles.find((c) => c.time === candle.time);
          if (!exists) {
            this.candles.push(candle);
          } else {
            // Update the existing candle (it may still be forming)
            Object.assign(exists, candle);
          }
        }
      }
    } catch (err) {
      this.log.warn(`Failed to fetch candles: ${err.message} – using cached data`);
    }

    // Keep rolling window
    if (this.candles.length > 500) {
      this.candles = this.candles.slice(-500);
    }

    const currentPrice = this.candles[this.candles.length - 1].close;

    // Manage existing positions
    for (const pos of [...this.portfolio.positions]) {
      pos.trailingStop = this.riskManager.updateTrailingStop(
        currentPrice, pos.trailingStop, pos.side
      );

      const trailingHit = pos.side === 'BUY'
        ? currentPrice <= pos.trailingStop
        : currentPrice >= pos.trailingStop;

      if (trailingHit && pos.trailingStop !== pos.stopLoss) {
        await this._closePosition(pos, currentPrice, 'Trailing stop hit');
        continue;
      }

      const exit = this.riskManager.checkExitConditions(pos, currentPrice);
      if (exit.shouldClose) {
        await this._closePosition(pos, currentPrice, exit.reason);
      }
    }

    // Check risk limits
    this.riskManager.checkDayRollover(this.portfolio.getTotalValue(currentPrice));
    if (this.riskManager.isHalted()) {
      if (this.tickCount % 10 === 0) {
        this.log.warn('Trading halted by risk manager');
      }
      return;
    }

    // Evaluate strategy
    const evaluation = this.strategy.evaluate(this.candles);

    if (evaluation.signal !== SIGNAL.HOLD) {
      this.log.debug(`Signal: ${evaluation.signal} (confidence: ${evaluation.confidence}%) – ${evaluation.reason}`);
    }

    if (evaluation.signal === SIGNAL.HOLD) return;

    const minConf = this.config.risk.minConfidence || 0;
    if (evaluation.confidence < minConf) return;

    if (!this.riskManager.canOpenPosition(this.portfolio.positions.length)) return;

    const side = evaluation.signal;
    const { quantity } = this.riskManager.calculatePositionSize(this.portfolio.balance, currentPrice, this.candles);
    if (quantity <= 0) return;

    const stopLoss = this.riskManager.getStopLoss(currentPrice, side);
    const takeProfit = this.riskManager.getTakeProfit(currentPrice, side);

    if (!this.riskManager.meetsRiskReward(currentPrice, stopLoss, takeProfit)) return;

    // Place order
    await this._openPosition(side, currentPrice, quantity, stopLoss, takeProfit, evaluation.reason);

    // Print status periodically
    if (this.tickCount % 10 === 0) {
      this.printStatus(currentPrice);
    }
  }

  /**
   * Open a position – paper or live.
   */
  async _openPosition(side, price, quantity, stopLoss, takeProfit, reason) {
    if (!this.paperMode) {
      // LIVE: place real market order on Binance
      try {
        const binanceSide = side === 'BUY' ? 'BUY' : 'SELL';
        const order = await this.client.marketOrder(this.symbol, binanceSide, quantity);
        // Use actual fill price from exchange
        const fillPrice = parseFloat(order.fills?.[0]?.price || price);
        this.portfolio.openPosition({ side, price: fillPrice, quantity, stopLoss, takeProfit, reason });
      } catch (err) {
        this.log.error(`Failed to place ${side} order: ${err.message}`);
      }
    } else {
      // PAPER: simulate locally
      this.portfolio.openPosition({ side, price, quantity, stopLoss, takeProfit, reason });
    }
  }

  /**
   * Close a position – paper or live.
   */
  async _closePosition(pos, currentPrice, reason) {
    if (!this.paperMode) {
      // LIVE: place closing market order
      try {
        const closeSide = pos.side === 'BUY' ? 'SELL' : 'BUY';
        await this.client.marketOrder(this.symbol, closeSide, pos.quantity);
      } catch (err) {
        this.log.error(`Failed to close position: ${err.message}`);
      }
    }
    const result = this.portfolio.closePosition(pos.id, currentPrice, reason);
    if (result) this.riskManager.recordPnL(result.pnl, this.portfolio.getTotalValue(currentPrice));
  }

  /**
   * Print current status.
   */
  printStatus(currentPrice) {
    const summary = this.portfolio.getSummary(currentPrice);
    this.log.info(`\n--- Status (tick ${this.tickCount}) | ${new Date().toLocaleTimeString()} ---`);
    this.log.info(`  Price: $${currentPrice.toFixed(2)} | Balance: $${this.portfolio.balance.toFixed(2)} | Total Value: $${summary.totalValue}`);
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

module.exports = LiveTradingEngine;
