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
 * ║    SYMBOL=ETH/USDT node run-backtest.js   # specific symbol ║
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

/**
 * Merge symbol-specific profile overrides into the base config.
 */
function getSymbolConfig(symbol) {
  const cfg = JSON.parse(JSON.stringify(config)); // deep clone
  const profile = config.symbolProfiles && config.symbolProfiles[symbol];
  if (profile) {
    // Override strategy params
    for (const key of ['ema_crossover', 'rsi', 'macd', 'bollinger']) {
      if (profile[key]) {
        cfg.strategies[key] = { ...cfg.strategies[key], ...profile[key] };
      }
    }
    // Override risk params
    if (profile.risk) {
      cfg.risk = { ...cfg.risk, ...profile.risk };
    }
  }
  cfg.symbol = symbol;
  return cfg;
}

function createStrategies(cfg) {
  return {
    ema_crossover: () => new EmaCrossoverStrategy(cfg.strategies.ema_crossover),
    rsi: () => new RsiStrategy(cfg.strategies.rsi),
    macd: () => new MacdStrategy(cfg.strategies.macd),
    bollinger: () => new BollingerStrategy(cfg.strategies.bollinger),
    combined: () => new CombinedStrategy(cfg.strategies.combined, cfg.strategies),
  };
}

function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║          STRATEGY BACKTESTING (v2.0)             ║');
  console.log('  ║   With slippage, commissions & adaptive sizing   ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');

  const symbol = process.env.SYMBOL || config.symbol;
  const cfg = getSymbolConfig(symbol);

  // Generate test data
  const startPrices = {
    'BTC/USDT': 40000, 'ETH/USDT': 2200, 'SOL/USDT': 95,
  };
  const startPrice = startPrices[symbol] || 40000;

  const candles = DataFeed.generateTrendingMarket({
    startPrice,
    numCandles: 1000,
  });

  console.log(`  Symbol: ${symbol}`);
  console.log(`  Test data: ${candles.length} candles`);
  console.log(`  Price range: $${Math.min(...candles.map(c => c.low)).toFixed(2)} – $${Math.max(...candles.map(c => c.high)).toFixed(2)}`);
  console.log(`  Trading costs: ${cfg.tradingCosts.slippageBps + cfg.tradingCosts.spreadBps + cfg.tradingCosts.commissionBps} bps per side`);
  console.log(`  Risk params: SL=${cfg.risk.stopLossPct}% TP=${cfg.risk.takeProfitPct}% Trail=${cfg.risk.trailingStopPct}%`);
  console.log('');

  const allStrategies = createStrategies(cfg);
  const requestedStrategy = process.env.STRATEGY || cfg.strategy;
  const strategiesToTest = requestedStrategy && requestedStrategy !== 'combined' && allStrategies[requestedStrategy]
    ? { [requestedStrategy]: allStrategies[requestedStrategy] }
    : allStrategies;

  const results = [];

  for (const [name, createStrategy] of Object.entries(strategiesToTest)) {
    const strategy = createStrategy();
    const backtester = new Backtester(cfg, strategy, logger);
    const result = backtester.run(candles, 60);

    results.push({ name, ...result.summary, trades: result.trades });

    console.log(`  Strategy: ${name.toUpperCase()}`);
    console.log(`    Return:        ${result.summary.totalReturn}`);
    console.log(`    Win Rate:      ${result.summary.winRate}`);
    console.log(`    Trades:        ${result.summary.totalTrades}`);
    console.log(`    Profit Factor: ${result.summary.profitFactor}`);
    console.log(`    Max Drawdown:  ${result.summary.maxDrawdown}`);
    console.log(`    Avg Win:       ${result.summary.avgWin}`);
    console.log(`    Avg Loss:      ${result.summary.avgLoss}`);
    console.log('');
  }

  // Rank strategies if testing multiple
  if (results.length > 1) {
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║              STRATEGY RANKING                    ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');

    // Composite score: weighted return + win rate + profit factor - drawdown
    const scored = results.map(r => {
      const ret = parseFloat(r.totalReturn) || 0;
      const wr = parseFloat(r.winRate) || 0;
      const pf = r.profitFactor === 'Inf' ? 3 : parseFloat(r.profitFactor) || 0;
      const dd = parseFloat(r.maxDrawdown) || 0;
      const score = (ret * 0.4) + (wr * 0.2) + (pf * 10 * 0.2) - (dd * 0.2);
      return { ...r, score };
    });

    scored.sort((a, b) => b.score - a.score);
    scored.forEach((r, i) => {
      console.log(`    ${i + 1}. ${r.name.padEnd(15)} Score: ${r.score.toFixed(1).padStart(7)} | Return: ${r.totalReturn.padStart(8)} | WR: ${r.winRate.padStart(6)} | PF: ${(r.profitFactor + '').padStart(5)} | DD: ${r.maxDrawdown.padStart(7)}`);
    });
    console.log('');
    console.log(`  Best strategy: ${scored[0].name}`);
    console.log(`  Use it: STRATEGY=${scored[0].name} SYMBOL=${symbol} node run-paper.js`);
    console.log('');
  }
}

main();
