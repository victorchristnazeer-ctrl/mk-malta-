#!/usr/bin/env node
/**
 * Crypto Backtester
 * Fetches real OHLCV data from Binance, or uses realistic synthetic data
 * modeled on actual crypto volatility/drift when the API is unreachable.
 *
 * Usage:
 *   node src/backtest-crypto.js
 *   SYMBOLS=BTCUSDT,ETHUSDT TIMEFRAMES=4h node src/backtest-crypto.js
 */
const config = require('../config/default');
const Logger = require('./utils/logger');
const CryptoDataFeed = require('./engines/crypto-data-feed');
const { generateRealisticCandles, CRYPTO_PROFILES } = require('./engines/realistic-crypto-data');
const Backtester = require('./engines/backtester');
const EmaCrossoverStrategy = require('./strategies/ema-crossover');
const RsiStrategy = require('./strategies/rsi-strategy');
const MacdStrategy = require('./strategies/macd-strategy');
const BollingerStrategy = require('./strategies/bollinger-strategy');
const CombinedStrategy = require('./strategies/combined-strategy');

const logger = new Logger('info');
const quietLogger = new Logger('error');

const SYMBOLS = (process.env.SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT').split(',');
const TIMEFRAMES = (process.env.TIMEFRAMES || '1h,4h').split(',');
const CANDLE_COUNT = parseInt(process.env.CANDLES || '750', 10);

function getAllStrategies() {
  return [
    { name: 'EMA Crossover', instance: new EmaCrossoverStrategy(config.strategies.ema_crossover) },
    { name: 'RSI', instance: new RsiStrategy(config.strategies.rsi) },
    { name: 'MACD', instance: new MacdStrategy(config.strategies.macd) },
    { name: 'Bollinger', instance: new BollingerStrategy(config.strategies.bollinger) },
    { name: 'Combined', instance: new CombinedStrategy(config.strategies.combined, config.strategies) },
  ];
}

function formatNum(n, decimals = 2) {
  const s = n.toFixed(decimals);
  return n >= 0 ? ` ${s}` : s;
}

async function backtestSymbol(symbol, timeframe, candles) {
  const strategies = getAllStrategies();
  const results = [];

  for (const { name, instance } of strategies) {
    const bt = new Backtester(
      { ...config, symbol: `${symbol} (${timeframe})` },
      instance,
      quietLogger
    );
    const res = bt.run(candles, 50);
    results.push({
      strategy: name,
      ...res.summary,
      trades: res.trades,
    });
  }

  return results;
}

function printTradeLog(trades, maxTrades = 20) {
  if (trades.length === 0) {
    logger.info('    No trades executed.');
    return;
  }
  const display = trades.slice(-maxTrades);
  if (trades.length > maxTrades) {
    logger.info(`    (showing last ${maxTrades} of ${trades.length} trades)`);
  }
  logger.info('    ┌──────┬─────────────────────┬─────────────────────┬────────────┬────────────┬──────────┬────────────────┐');
  logger.info('    │  #   │ Entry Time          │ Exit Time           │ Entry      │ Exit       │ P&L %    │ Reason         │');
  logger.info('    ├──────┼─────────────────────┼─────────────────────┼────────────┼────────────┼──────────┼────────────────┤');

  const offset = trades.length > maxTrades ? trades.length - maxTrades : 0;
  display.forEach((t, i) => {
    const num = String(offset + i + 1).padStart(4);
    const entry = t.openTime.slice(0, 19).replace('T', ' ');
    const exit = t.exitTime.slice(0, 19).replace('T', ' ');
    const entryP = t.entryPrice.toFixed(2).padStart(10);
    const exitP = t.exitPrice.toFixed(2).padStart(10);
    const pnlPct = (t.pnlPct >= 0 ? '+' : '') + t.pnlPct.toFixed(2) + '%';
    const reason = (t.exitReason || '').slice(0, 14).padEnd(14);
    logger.info(`    │ ${num} │ ${entry} │ ${exit} │ ${entryP} │ ${exitP} │ ${pnlPct.padStart(8)} │ ${reason} │`);
  });
  logger.info('    └──────┴─────────────────────┴─────────────────────┴────────────┴────────────┴──────────┴────────────────┘');
}

async function run() {
  logger.info('\n' + '═'.repeat(80));
  logger.info('  REAL CRYPTO BACKTEST');
  logger.info('  Fetching live market data from Binance...');
  logger.info('═'.repeat(80));

  const allResults = [];

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      logger.info(`\n${'─'.repeat(80)}`);
      logger.info(`  Fetching ${symbol} ${timeframe} (${CANDLE_COUNT} candles)...`);

      let candles;
      let dataSource = 'Binance API';
      try {
        candles = await CryptoDataFeed.fetchExtended(symbol, timeframe, CANDLE_COUNT);
      } catch (err) {
        logger.warn(`  Binance API unavailable (${err.message}), using realistic synthetic data`);
        if (!CRYPTO_PROFILES[symbol]) {
          logger.error(`  No profile for ${symbol}, skipping`);
          continue;
        }
        candles = generateRealisticCandles(symbol, timeframe, CANDLE_COUNT);
        dataSource = 'Realistic synthetic (modeled on real crypto volatility)';
      }

      if (candles.length < 100) {
        logger.warn(`  Only got ${candles.length} candles for ${symbol}, skipping`);
        continue;
      }

      const firstPrice = candles[0].close;
      const lastPrice = candles[candles.length - 1].close;
      const buyHoldReturn = ((lastPrice - firstPrice) / firstPrice) * 100;

      logger.info(`  Data source: ${dataSource}`);
      logger.info(`  Data: ${candles[0].time.slice(0, 10)} to ${candles[candles.length - 1].time.slice(0, 10)} (${candles.length} candles)`);
      logger.info(`  Price: $${firstPrice.toFixed(2)} → $${lastPrice.toFixed(2)} (Buy & Hold: ${buyHoldReturn >= 0 ? '+' : ''}${buyHoldReturn.toFixed(2)}%)`);
      logger.info('');

      const results = await backtestSymbol(symbol, timeframe, candles);

      // Print summary table
      logger.info('  ┌─────────────────┬────────────┬──────────┬────────┬──────┬────────┬──────────┬──────────┬────────────┐');
      logger.info('  │ Strategy        │ Return     │ Win Rate │ Trades │ Wins │ Losses │ Avg Win  │ Avg Loss │ Max DD     │');
      logger.info('  ├─────────────────┼────────────┼──────────┼────────┼──────┼────────┼──────────┼──────────┼────────────┤');

      for (const r of results) {
        const name = r.strategy.padEnd(15);
        const ret = r.totalReturn.padStart(10);
        const wr = r.winRate.padStart(8);
        const trades = String(r.totalTrades).padStart(6);
        const wins = String(r.wins).padStart(4);
        const losses = String(r.losses).padStart(6);
        const avgW = r.avgWin.padStart(8);
        const avgL = r.avgLoss.padStart(8);
        const dd = r.maxDrawdown.padStart(10);
        logger.info(`  │ ${name} │ ${ret} │ ${wr} │ ${trades} │ ${wins} │ ${losses} │ ${avgW} │ ${avgL} │ ${dd} │`);
      }

      const bhName = 'Buy & Hold'.padEnd(15);
      const bhRet = (buyHoldReturn.toFixed(2) + '%').padStart(10);
      logger.info(`  ├─────────────────┼────────────┼──────────┼────────┼──────┼────────┼──────────┼──────────┼────────────┤`);
      logger.info(`  │ ${bhName} │ ${bhRet} │      n/a │    n/a │  n/a │    n/a │      n/a │      n/a │        n/a │`);
      logger.info('  └─────────────────┴────────────┴──────────┴────────┴──────┴────────┴──────────┴──────────┴────────────┘');

      // Detailed trade log for best strategy
      const best = results.reduce((a, b) =>
        parseFloat(a.totalReturn) > parseFloat(b.totalReturn) ? a : b
      );

      logger.info(`\n  Best strategy: ${best.strategy} (${best.totalReturn} return, ${best.winRate} win rate)`);
      if (parseFloat(best.totalReturn) > buyHoldReturn) {
        logger.info(`  >>> BEATS Buy & Hold by ${(parseFloat(best.totalReturn) - buyHoldReturn).toFixed(2)}%`);
      } else {
        logger.info(`  <<< Underperforms Buy & Hold by ${(buyHoldReturn - parseFloat(best.totalReturn)).toFixed(2)}%`);
      }

      logger.info(`\n  Trade log for ${best.strategy}:`);
      printTradeLog(best.trades);

      allResults.push({
        symbol,
        timeframe,
        buyHoldReturn,
        results,
        bestStrategy: best.strategy,
        bestReturn: parseFloat(best.totalReturn),
      });
    }
  }

  // ── Grand Summary ──────────────────────────────────────────────
  logger.info('\n' + '═'.repeat(80));
  logger.info('  GRAND SUMMARY');
  logger.info('═'.repeat(80));

  logger.info('  ┌────────────┬───────────┬─────────────────┬────────────┬──────────────────┬────────────┐');
  logger.info('  │ Symbol     │ Timeframe │ Best Strategy   │ Return     │ vs Buy & Hold    │ Win Rate   │');
  logger.info('  ├────────────┼───────────┼─────────────────┼────────────┼──────────────────┼────────────┤');

  let totalBotReturn = 0;
  let totalBHReturn = 0;
  let count = 0;

  for (const r of allResults) {
    const sym = r.symbol.padEnd(10);
    const tf = r.timeframe.padEnd(9);
    const strat = r.bestStrategy.padEnd(15);
    const ret = (r.bestReturn.toFixed(2) + '%').padStart(10);
    const diff = r.bestReturn - r.buyHoldReturn;
    const vs = ((diff >= 0 ? '+' : '') + diff.toFixed(2) + '%').padStart(16);
    const bestResult = r.results.find((x) => x.strategy === r.bestStrategy);
    const wr = (bestResult?.winRate || 'n/a').padStart(10);
    logger.info(`  │ ${sym} │ ${tf} │ ${strat} │ ${ret} │ ${vs} │ ${wr} │`);

    totalBotReturn += r.bestReturn;
    totalBHReturn += r.buyHoldReturn;
    count++;
  }

  logger.info('  └────────────┴───────────┴─────────────────┴────────────┴──────────────────┴────────────┘');

  if (count > 0) {
    const avgBot = totalBotReturn / count;
    const avgBH = totalBHReturn / count;
    logger.info(`\n  Average best-strategy return: ${avgBot.toFixed(2)}%`);
    logger.info(`  Average buy & hold return:    ${avgBH.toFixed(2)}%`);
    logger.info(`  Average alpha:                ${(avgBot - avgBH).toFixed(2)}%`);
  }

  logger.info('\n' + '═'.repeat(80));
  logger.info('  DISCLAIMER: Past performance does not guarantee future results.');
  logger.info('  Always paper trade before risking real capital.');
  logger.info('═'.repeat(80) + '\n');
}

run().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
