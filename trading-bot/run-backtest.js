#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              BACKTEST  –  Test Before You Trade              ║
 * ║                                                             ║
 * ║  Runs your strategy against historical data to see how      ║
 * ║  it would have performed. Always backtest first!            ║
 * ║                                                             ║
 * ║  Usage:                                                     ║
 * ║    node run-backtest.js                   # all strategies  ║
 * ║    STRATEGY=rsi node run-backtest.js      # specific one    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const config = require('./config/default');
const Logger = require('./src/utils/logger');
const Backtester = require('./src/engines/backtester');
const DataFeed = require('./src/engines/data-feed');

const EmaCrossoverStrategy = require('./src/strategies/ema-crossover');
const RsiStrategy = require('./src/strategies/rsi-strategy');
const MacdStrategy = require('./src/strategies/macd-strategy');
const BollingerStrategy = require('./src/strategies/bollinger-strategy');
const CombinedStrategy = require('./src/strategies/combined-strategy');

const logger = new Logger('info');

const allStrategies = {
  ema_crossover: () => new EmaCrossoverStrategy(config.strategies.ema_crossover),
  rsi: () => new RsiStrategy(config.strategies.rsi),
  macd: () => new MacdStrategy(config.strategies.macd),
  bollinger: () => new BollingerStrategy(config.strategies.bollinger),
  combined: () => new CombinedStrategy(config.strategies.combined, config.strategies),
};

function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║           STRATEGY BACKTESTING           ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // Generate test data
  const candles = DataFeed.generateTrendingMarket({
    startPrice: 40000,
    numCandles: 1000,
  });

  console.log(`  Test data: ${candles.length} candles`);
  console.log(`  Price range: $${Math.min(...candles.map(c => c.low)).toFixed(0)} – $${Math.max(...candles.map(c => c.high)).toFixed(0)}`);
  console.log('');

  const strategiesToTest = config.strategy && config.strategy !== 'combined'
    ? { [config.strategy]: allStrategies[config.strategy] }
    : allStrategies;

  const results = [];

  for (const [name, createStrategy] of Object.entries(strategiesToTest)) {
    const strategy = createStrategy();
    const backtester = new Backtester(config, strategy, logger);
    const result = backtester.run(candles, 60);

    results.push({ name, ...result.summary });

    console.log(`  Strategy: ${name.toUpperCase()}`);
    console.log(`    Return:       ${result.summary.totalReturn}`);
    console.log(`    Win Rate:     ${result.summary.winRate}`);
    console.log(`    Trades:       ${result.summary.totalTrades}`);
    console.log(`    Profit Factor: ${result.summary.profitFactor}`);
    console.log(`    Max Drawdown: ${result.summary.maxDrawdown}`);
    console.log('');
  }

  // Rank strategies if testing multiple
  if (results.length > 1) {
    console.log('  ── RANKING (by return) ──');
    results
      .sort((a, b) => parseFloat(b.totalReturn) - parseFloat(a.totalReturn))
      .forEach((r, i) => {
        console.log(`    ${i + 1}. ${r.name.padEnd(15)} → ${r.totalReturn} return, ${r.winRate} win rate`);
      });
    console.log('');
    console.log(`  Best strategy: ${results[0].name}`);
    console.log(`  Use it: STRATEGY=${results[0].name} node run-paper.js`);
    console.log('');
  }
}

main();
