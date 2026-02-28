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
      fastPeriod: 8,
      slowPeriod: 21,
      trendPeriod: 50,            // long EMA for trend confirmation filter
    },
    rsi: {
      period: 14,
      overbought: 70,             // standard overbought threshold
      oversold: 30,               // standard oversold threshold
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
    maxPositionSizePct: 2,        // risk 2% of portfolio per trade
    stopLossPct: 2,               // tight stop-loss – cut losses quickly
    takeProfitPct: 4,             // 2:1 reward-to-risk ratio
    trailingStopPct: 1.5,         // tight trailing stop – lock in profits
    maxOpenPositions: 3,          // allow up to 3 concurrent positions
    maxDailyLossPct: 5,           // daily loss limit
    maxDrawdownPct: 15,           // max total drawdown before halting
    riskRewardRatio: 1.5,         // only take trades with favorable R:R
    minConfidence: 10,            // minimum strategy confidence to enter trade
  },

  // ── Execution ─────────────────────────────────────────────────────
  paperTrading: process.env.PAPER_TRADING === 'true',
  initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL || '60000', 10),

  // ── Logging ───────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info', // debug | info | warn | error
};
