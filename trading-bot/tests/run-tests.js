#!/usr/bin/env node
/**
 * Simple test runner – no external dependencies needed.
 */
const { sma, ema, rsi, macd, bollingerBands } = require('../src/utils/indicators');
const EmaCrossoverStrategy = require('../src/strategies/ema-crossover');
const RsiStrategy = require('../src/strategies/rsi-strategy');
const MacdStrategy = require('../src/strategies/macd-strategy');
const BollingerStrategy = require('../src/strategies/bollinger-strategy');
const CombinedStrategy = require('../src/strategies/combined-strategy');
const RiskManager = require('../src/engines/risk-manager');
const Portfolio = require('../src/engines/portfolio');
const DataFeed = require('../src/engines/data-feed');
const Backtester = require('../src/engines/backtester');
const Logger = require('../src/utils/logger');
const config = require('../config/default');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.log(`  FAIL: ${message}`);
  }
}

function assertClose(a, b, tolerance, message) {
  assert(Math.abs(a - b) < tolerance, `${message} (${a} ≈ ${b})`);
}

// ── Indicator Tests ──────────────────────────────────────────────

console.log('\n=== Indicator Tests ===\n');

const testData = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

// SMA
const sma3 = sma(testData, 3);
assert(sma3[0] === null, 'SMA: first element null when period not met');
assert(sma3[1] === null, 'SMA: second element null when period not met');
assertClose(sma3[2], 11, 0.01, 'SMA(3) first value = 11');
assertClose(sma3[10], 19, 0.01, 'SMA(3) last value = 19');

// EMA
const ema3 = ema(testData, 3);
assert(ema3[0] === null, 'EMA: first element null');
assert(ema3[2] !== null, 'EMA: third element not null');

// RSI
const rsiData = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
  45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
const rsi14 = rsi(rsiData, 14);
assert(rsi14[0] === null, 'RSI: first element null');
assert(rsi14[rsi14.length - 1] !== null, 'RSI: last element computed');
assert(rsi14[rsi14.length - 1] >= 0 && rsi14[rsi14.length - 1] <= 100, 'RSI: value in 0-100 range');

// MACD
const macdResult = macd(rsiData, 3, 6, 3);
assert(Array.isArray(macdResult.macd), 'MACD: returns macd array');
assert(Array.isArray(macdResult.signal), 'MACD: returns signal array');
assert(Array.isArray(macdResult.histogram), 'MACD: returns histogram array');

// Bollinger Bands
const bb = bollingerBands(testData, 5, 2);
assert(bb.upper[4] !== null, 'BB: first valid upper band');
assert(bb.middle[4] !== null, 'BB: first valid middle band');
assert(bb.lower[4] !== null, 'BB: first valid lower band');
assert(bb.upper[4] > bb.middle[4], 'BB: upper > middle');
assert(bb.lower[4] < bb.middle[4], 'BB: lower < middle');

// ── Strategy Tests ───────────────────────────────────────────────

console.log('\n=== Strategy Tests ===\n');

const candles = DataFeed.generateTrendingMarket({ numCandles: 200 });

// EMA Crossover
const emaSt = new EmaCrossoverStrategy({ fastPeriod: 9, slowPeriod: 21 });
const emaResult = emaSt.evaluate(candles);
assert(emaResult.signal !== undefined, 'EMA strategy: returns signal');
assert(['BUY', 'SELL', 'HOLD'].includes(emaResult.signal), 'EMA strategy: valid signal');

// RSI
const rsiSt = new RsiStrategy({ period: 14, overbought: 70, oversold: 30 });
const rsiResult = rsiSt.evaluate(candles);
assert(rsiResult.signal !== undefined, 'RSI strategy: returns signal');

// MACD
const macdSt = new MacdStrategy();
const macdStResult = macdSt.evaluate(candles);
assert(macdStResult.signal !== undefined, 'MACD strategy: returns signal');

// Bollinger
const bbSt = new BollingerStrategy();
const bbResult = bbSt.evaluate(candles);
assert(bbResult.signal !== undefined, 'Bollinger strategy: returns signal');

// Combined
const combinedSt = new CombinedStrategy({ minConfirmations: 2 }, config.strategies);
const combinedResult = combinedSt.evaluate(candles);
assert(combinedResult.signal !== undefined, 'Combined strategy: returns signal');
assert(typeof combinedResult.confidence === 'number', 'Combined strategy: returns confidence');

// ── Risk Manager Tests ───────────────────────────────────────────

console.log('\n=== Risk Manager Tests ===\n');

const logger = new Logger('error');
const rm = new RiskManager(config, logger);

// Position sizing
const posSize = rm.calculatePositionSize(10000, 40000);
assert(posSize.quantity > 0, 'Risk: position quantity > 0');
assert(posSize.value <= 10000 * 0.25, 'Risk: position value <= 25% of balance');

// Stop-loss / take-profit
const sl = rm.getStopLoss(40000, 'BUY');
assert(sl < 40000, 'Risk: buy stop-loss below entry');
const tp = rm.getTakeProfit(40000, 'BUY');
assert(tp > 40000, 'Risk: buy take-profit above entry');

const slSell = rm.getStopLoss(40000, 'SELL');
assert(slSell > 40000, 'Risk: sell stop-loss above entry');
const tpSell = rm.getTakeProfit(40000, 'SELL');
assert(tpSell < 40000, 'Risk: sell take-profit below entry');

// Risk/reward check
assert(rm.meetsRiskReward(40000, sl, tp), 'Risk: meets risk/reward ratio');

// Position limits
assert(rm.canOpenPosition(0), 'Risk: can open when no positions');
assert(!rm.canOpenPosition(config.risk.maxOpenPositions), 'Risk: cannot exceed max positions');

// ── Portfolio Tests ──────────────────────────────────────────────

console.log('\n=== Portfolio Tests ===\n');

const portfolio = new Portfolio(10000, logger);
assert(portfolio.balance === 10000, 'Portfolio: initial balance correct');

const pos = portfolio.openPosition({
  side: 'BUY', price: 100, quantity: 10, stopLoss: 98, takeProfit: 104, reason: 'test',
});
assert(pos !== null, 'Portfolio: position opened');
assert(portfolio.balance === 9000, 'Portfolio: balance reduced by cost');
assert(portfolio.positions.length === 1, 'Portfolio: one open position');

const closeResult = portfolio.closePosition(pos.id, 102, 'test close');
assert(closeResult !== null, 'Portfolio: position closed');
assert(closeResult.pnl === 20, 'Portfolio: P&L correct (10 * 2 = 20)');
assert(portfolio.positions.length === 0, 'Portfolio: no open positions');
assert(portfolio.tradeHistory.length === 1, 'Portfolio: one trade in history');

const summary = portfolio.getSummary(100);
assert(summary.totalTrades === 1, 'Portfolio: summary shows 1 trade');
assert(summary.wins === 1, 'Portfolio: summary shows 1 win');

// ── Backtester Tests ─────────────────────────────────────────────

console.log('\n=== Backtester Tests ===\n');

const btCandles = DataFeed.generateTrendingMarket({ numCandles: 300 });
const btStrategy = new CombinedStrategy({ minConfirmations: 2 }, config.strategies);
const bt = new Backtester(config, btStrategy, logger);
const btResult = bt.run(btCandles);
assert(btResult.summary !== undefined, 'Backtest: returns summary');
assert(btResult.trades !== undefined, 'Backtest: returns trades');
assert(typeof btResult.summary.totalTrades === 'number', 'Backtest: totalTrades is number');
assert(btResult.summary.totalReturn !== undefined, 'Backtest: totalReturn present');

// ── Data Feed Tests ──────────────────────────────────────────────

console.log('\n=== Data Feed Tests ===\n');

const synCandles = DataFeed.generateSyntheticCandles({ numCandles: 100 });
assert(synCandles.length === 100, 'DataFeed: generates correct number of candles');
assert(synCandles[0].open > 0, 'DataFeed: candle has positive open');
assert(synCandles[0].high >= synCandles[0].low, 'DataFeed: high >= low');

const trendCandles = DataFeed.generateTrendingMarket({ numCandles: 200 });
assert(trendCandles.length === 200, 'DataFeed: trending market correct count');

// ── Summary ──────────────────────────────────────────────────────

console.log(`\n${'='.repeat(40)}`);
console.log(`  Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
