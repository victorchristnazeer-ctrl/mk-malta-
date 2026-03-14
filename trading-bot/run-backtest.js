#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              BACKTEST  –  Test Before You Trade              ║
 * ║                                                             ║
 * ║  Runs your strategy against historical data to see how      ║
 * ║  it would have performed. Always backtest first!            ║
 * ║                                                             ║
 * ║  Usage:                                                     ║
 * ║    node run-backtest.js                   # synthetic data  ║
 * ║    REAL_DATA=true node run-backtest.js    # Binance data    ║
 * ║    REAL_DATA=true SYMBOL=ETHUSDT INTERVAL=4h CANDLES=2000   ║
 * ║      STRATEGY=rsi node run-backtest.js    # full options    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const config = require('./config/default');
const Logger = require('./src/utils/logger');
const Backtester = require('./src/engines/backtester');
const DataFeed = require('./src/engines/data-feed');
const CryptoDataFeed = require('./src/engines/crypto-data-feed');

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

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║           STRATEGY BACKTESTING           ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // ── Data source ──────────────────────────────────────────────
  const useRealData = process.env.REAL_DATA === 'true';
  // Binance symbol format has no slash (e.g. BTCUSDT not BTC/USDT)
  const symbol = (process.env.SYMBOL || 'BTCUSDT').replace('/', '');
  const interval = process.env.INTERVAL || config.timeframe || '1h';
  const totalCandles = parseInt(process.env.CANDLES || '1000', 10);

  let candles;

  if (useRealData) {
    console.log(`  Fetching real data from Binance...`);
    console.log(`  Symbol: ${symbol} | Interval: ${interval} | Candles: ${totalCandles}`);
    console.log('');
    try {
      candles = await CryptoDataFeed.fetchExtended(symbol, interval, totalCandles);
    } catch (err) {
      console.error(`  ERROR fetching real data: ${err.message}`);
      process.exit(1);
    }
  } else {
    candles = DataFeed.generateTrendingMarket({
      startPrice: 40000,
      numCandles: totalCandles,
    });
  }

  const dataSource = useRealData ? `Binance ${symbol} ${interval}` : 'Synthetic';
  console.log(`  Data source: ${dataSource}`);
  console.log(`  Candles: ${candles.length} (${candles[0].time} → ${candles[candles.length - 1].time})`);
  console.log(`  Price range: $${Math.min(...candles.map(c => c.low)).toFixed(2)} – $${Math.max(...candles.map(c => c.high)).toFixed(2)}`);
  console.log('');

  // ── Strategy selection ────────────────────────────────────────
  const strategiesToTest = config.strategy && allStrategies[config.strategy]
    ? { [config.strategy]: allStrategies[config.strategy] }
    : allStrategies;

  const results = [];

  for (const [name, createStrategy] of Object.entries(strategiesToTest)) {
    const strategy = createStrategy();
    const backtester = new Backtester(config, strategy, logger);
    const result = backtester.run(candles, 60);
    const s = result.summary;

    results.push({ name, summary: s });

    console.log(`  Strategy: ${name.toUpperCase()}`);
    console.log(`    Return:        ${s.totalReturn}`);
    console.log(`    Win Rate:      ${s.winRate}`);
    console.log(`    Trades:        ${s.totalTrades}`);
    console.log(`    Profit Factor: ${s.profitFactor}`);
    console.log(`    Max Drawdown:  ${s.maxDrawdown}`);
    console.log(`    Avg Win/Loss:  ${s.avgWin} / ${s.avgLoss}`);
    console.log('');
  }

  // ── Ranking ───────────────────────────────────────────────────
  if (results.length > 1) {
    console.log('  ── RANKING (by return) ──');
    results
      .sort((a, b) => parseFloat(b.summary.totalReturn) - parseFloat(a.summary.totalReturn))
      .forEach((r, i) => {
        console.log(`    ${i + 1}. ${r.name.padEnd(15)} → ${r.summary.totalReturn} return, ${r.summary.winRate} win rate`);
      });
    console.log('');
    console.log(`  Best strategy: ${results[0].name}`);
    console.log(`  Use it: STRATEGY=${results[0].name} node run-paper.js`);
    console.log('');
  }
}

main().catch((err) => {
  console.error('Backtest failed:', err.message);
  process.exit(1);
});
