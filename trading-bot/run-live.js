#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              LIVE TRADING  –  Real Money                    ║
 * ║                                                             ║
 * ║  Connects to Binance and places REAL orders.                ║
 * ║  You MUST configure API keys before running this.           ║
 * ║                                                             ║
 * ║  Usage:                                                     ║
 * ║    1. cp .env.example .env                                  ║
 * ║    2. Edit .env with your API keys                          ║
 * ║    3. node run-live.js                                      ║
 * ║                                                             ║
 * ║  Press Ctrl+C to stop and see final results.                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// Force paper trading OFF
process.env.PAPER_TRADING = 'false';

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
  // ── Safety checks ─────────────────────────────────────────────

  // 1. API keys
  if (!config.exchange.apiKey || !config.exchange.apiSecret) {
    console.error('');
    console.error('  ERROR: API keys not configured!');
    console.error('');
    console.error('  Steps to fix:');
    console.error('    1. cp .env.example .env');
    console.error('    2. Edit .env and set API_KEY and API_SECRET');
    console.error('    3. Run this script again');
    console.error('');
    console.error('  Get API keys from: https://www.binance.com/en/my/settings/api-management');
    console.error('');
    process.exit(1);
  }

  // 2. Confirmation prompt
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   ⚠  LIVE TRADING MODE – REAL MONEY AT RISK ⚠   ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Symbol:    ${config.symbol}`);
  console.log(`  Strategy:  ${config.strategy}`);
  console.log(`  Timeframe: ${config.timeframe}`);
  console.log(`  Balance:   $${config.initialBalance} (position sizing reference)`);
  console.log(`  Testnet:   ${config.exchange.testnet ? 'YES (safe)' : 'NO (real exchange)'}`);
  console.log(`  Max Risk:  ${config.risk.maxPositionSizePct}% per trade`);
  console.log(`  Stop Loss: ${config.risk.stopLossPct}%`);
  console.log(`  Max DD:    ${config.risk.maxDrawdownPct}% (auto-halt)`);
  console.log('');

  // 3. Wait for user confirmation
  const confirmed = await askConfirmation(
    '  Type "YES" to start live trading (or anything else to cancel): '
  );

  if (confirmed !== 'YES') {
    console.log('');
    console.log('  Cancelled. No orders were placed.');
    console.log('  Tip: Use "node run-paper.js" for risk-free practice.');
    console.log('');
    process.exit(0);
  }

  console.log('');
  console.log('  Starting live trading bot...');
  console.log('  Press Ctrl+C at any time to stop.');
  console.log('');

  config.paperTrading = false;

  const strategy = getStrategy(config.strategy);
  const engine = new LiveTradingEngine(config, strategy, logger);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n  Shutting down live trading bot...');
    engine.stop();
    setTimeout(() => process.exit(0), 1000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await engine.start();
}

/**
 * Simple stdin prompt (no external dependencies).
 */
function askConfirmation(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      resolve(data.trim());
    });
  });
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
