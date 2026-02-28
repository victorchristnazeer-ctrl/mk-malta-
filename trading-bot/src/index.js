#!/usr/bin/env node
/**
 * Trading Bot – main entry point.
 *
 * Usage:
 *   node src/index.js                    # run with default config
 *   PAPER_TRADING=true node src/index.js # force paper trading mode
 *   STRATEGY=rsi node src/index.js       # use RSI strategy
 *
 * For backtesting:
 *   node src/backtest.js
 */
const config = require('../config/default');
const Logger = require('./utils/logger');
const TradingEngine = require('./engines/trading-engine');

// Strategy imports
const EmaCrossoverStrategy = require('./strategies/ema-crossover');
const RsiStrategy = require('./strategies/rsi-strategy');
const MacdStrategy = require('./strategies/macd-strategy');
const BollingerStrategy = require('./strategies/bollinger-strategy');
const CombinedStrategy = require('./strategies/combined-strategy');

const logger = new Logger(config.logLevel);

function getStrategy(name) {
  switch (name) {
    case 'ema_crossover':
      return new EmaCrossoverStrategy(config.strategies.ema_crossover);
    case 'rsi':
      return new RsiStrategy(config.strategies.rsi);
    case 'macd':
      return new MacdStrategy(config.strategies.macd);
    case 'bollinger':
      return new BollingerStrategy(config.strategies.bollinger);
    case 'combined':
    default:
      return new CombinedStrategy(config.strategies.combined, config.strategies);
  }
}

async function main() {
  logger.info('Trading Bot v1.0.0');
  logger.info(`Configuration loaded: strategy=${config.strategy} symbol=${config.symbol} timeframe=${config.timeframe}`);

  if (!config.paperTrading) {
    logger.warn('='.repeat(60));
    logger.warn('WARNING: Paper trading is OFF. Running in simulated live mode.');
    logger.warn('For real trading, integrate with an exchange API (e.g. ccxt).');
    logger.warn('='.repeat(60));
  }

  const strategy = getStrategy(config.strategy);
  const engine = new TradingEngine(config, strategy, logger);

  // Graceful shutdown
  const shutdown = () => {
    logger.info('\nShutdown signal received...');
    engine.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await engine.start();
}

main().catch((err) => {
  logger.error('Fatal error:', err.message);
  process.exit(1);
});
