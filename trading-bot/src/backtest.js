#!/usr/bin/env node
/**
 * Backtest runner – test strategies against historical/synthetic data.
 *
 * Usage:
 *   node src/backtest.js
 *   STRATEGY=rsi node src/backtest.js
 *   STRATEGY=ema_crossover node src/backtest.js
 */
const config = require('../config/default');
const Logger = require('./utils/logger');
const DataFeed = require('./engines/data-feed');
const Backtester = require('./engines/backtester');

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

function runBacktest() {
  const strategyName = config.strategy;
  const strategy = getStrategy(strategyName);

  logger.info('Generating synthetic market data...');
  const candles = DataFeed.generateTrendingMarket({
    startPrice: 40000,
    numCandles: 1000,
  });

  const backtester = new Backtester(config, strategy, logger);
  const results = backtester.run(candles);

  // Run a comparison across all strategies
  logger.info('\n\n' + '='.repeat(60));
  logger.info('STRATEGY COMPARISON');
  logger.info('='.repeat(60));

  const strategies = ['ema_crossover', 'rsi', 'macd', 'bollinger', 'combined'];
  const comparisonCandles = DataFeed.generateTrendingMarket({
    startPrice: 40000,
    numCandles: 1000,
  });

  const compLogger = new Logger('warn'); // quiet for comparison

  for (const name of strategies) {
    const strat = getStrategy(name);
    const bt = new Backtester(config, strat, compLogger);
    const res = bt.run(comparisonCandles);
    logger.info(`  ${name.padEnd(15)} | Return: ${res.summary.totalReturn.padEnd(10)} | Win Rate: ${res.summary.winRate.padEnd(8)} | Trades: ${String(res.summary.totalTrades).padEnd(5)} | Max DD: ${res.summary.maxDrawdown.padEnd(8)} | PF: ${res.summary.profitFactor}`);
  }
  logger.info('='.repeat(60));

  return results;
}

runBacktest();
