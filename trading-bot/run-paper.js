#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                PAPER TRADING  –  Zero Risk                  ║
 * ║                                                             ║
 * ║  Uses REAL Binance market data but simulates all orders     ║
 * ║  locally. No API keys required. No money at risk.           ║
 * ║                                                             ║
 * ║  Usage:                                                     ║
 * ║    node run-paper.js                      # defaults        ║
 * ║    SYMBOL=ETHUSDT node run-paper.js       # change pair     ║
 * ║    STRATEGY=rsi node run-paper.js         # change strategy ║
 * ║    TIMEFRAME=15m node run-paper.js        # change candles  ║
 * ║                                                             ║
 * ║  Press Ctrl+C to stop and see final results.                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// Force paper trading ON regardless of .env
process.env.PAPER_TRADING = 'true';

const config = require('./config/default');
const Logger = require('./src/utils/logger');
const LiveTradingEngine = require('./src/engines/live-trading-engine');

// Strategy imports
const EmaCrossoverStrategy = require('./src/strategies/ema-crossover');
const RsiStrategy = require('./src/strategies/rsi-strategy');
const MacdStrategy = require('./src/strategies/macd-strategy');
const BollingerStrategy = require('./src/strategies/bollinger-strategy');
const CombinedStrategy = require('./src/strategies/combined-strategy');

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
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     PAPER TRADING MODE (no real money)   ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Symbol:    ${config.symbol}`);
  console.log(`  Strategy:  ${config.strategy}`);
  console.log(`  Timeframe: ${config.timeframe}`);
  console.log(`  Balance:   $${config.initialBalance} (simulated)`);
  console.log(`  Poll:      every ${config.pollIntervalMs / 1000}s`);
  console.log('');

  // Re-read config to pick up PAPER_TRADING=true
  config.paperTrading = true;

  const strategy = getStrategy(config.strategy);
  const engine = new LiveTradingEngine(config, strategy, logger);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n  Shutting down paper trading bot...');
    engine.stop();
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await engine.start();
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
