/**
 * Default configuration for the trading bot.
 * Override via environment variables or by passing options at runtime.
 */
module.exports = {
  // ── Exchange / Data settings ──────────────────────────────────────
  exchange: {
    name: process.env.EXCHANGE || 'binance',
    apiKey: process.env.API_KEY || '',
    apiSecret: process.env.API_SECRET || '',
    testnet: process.env.TESTNET === 'true',
  },

  // ── Trading pair ──────────────────────────────────────────────────
  symbol: process.env.SYMBOL || 'BTC/USDT',
  timeframe: process.env.TIMEFRAME || '1h', // candle interval

  // ── Strategy selection ────────────────────────────────────────────
  // Available: ema_crossover, rsi, macd, bollinger, combined
  strategy: process.env.STRATEGY || 'combined',

  // ── Strategy parameters ───────────────────────────────────────────
  strategies: {
    ema_crossover: {
      fastPeriod: 9,
      slowPeriod: 21,
      trendPeriod: 50,            // long EMA for trend confirmation filter
    },
    rsi: {
      period: 14,
      overbought: 75,             // stricter – only extreme overbought
      oversold: 25,               // stricter – only extreme oversold
      trendPeriod: 50,
    },
    macd: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      trendPeriod: 50,
    },
    bollinger: {
      period: 20,
      stdDev: 2,
      trendPeriod: 50,
    },
    combined: {
      minConfirmations: 2,        // 2/4 strategies must agree
      minConfidence: 10,          // minimum avg confidence from agreeing strategies
    },
  },

  // ── Risk management ───────────────────────────────────────────────
  risk: {
    maxPositionSizePct: 1.5,      // smaller positions = less risk per trade
    stopLossPct: 5,               // wide stop-loss – room to breathe
    takeProfitPct: 2,             // tight take-profit – grabs frequent wins
    trailingStopPct: 3.5,         // wide trailing stop – avoid noise exits
    maxOpenPositions: 2,          // fewer concurrent = more selective
    maxDailyLossPct: 6,           // daily loss limit
    maxDrawdownPct: 20,           // max total drawdown before halting
    riskRewardRatio: 0.4,         // allow asymmetric R:R (high win rate compensates)
    minConfidence: 5,             // minimum strategy confidence to enter trade
  },

  // ── Execution ─────────────────────────────────────────────────────
  paperTrading: process.env.PAPER_TRADING === 'true',
  initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL || '60000', 10),

  // ── Logging ───────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info', // debug | info | warn | error
};
