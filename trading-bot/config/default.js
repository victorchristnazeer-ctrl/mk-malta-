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
    },
    rsi: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },
    macd: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    },
    bollinger: {
      period: 20,
      stdDev: 2,
    },
    combined: {
      // Requires at least N strategies to agree before entering
      minConfirmations: 2,
    },
  },

  // ── Risk management ───────────────────────────────────────────────
  risk: {
    maxPositionSizePct: 2,        // max % of portfolio per trade
    stopLossPct: 2,               // stop-loss %
    takeProfitPct: 4,             // take-profit %
    trailingStopPct: 1.5,         // trailing stop %
    maxOpenPositions: 3,          // max concurrent positions
    maxDailyLossPct: 5,           // max daily drawdown before halting
    maxDrawdownPct: 15,           // max total drawdown before halting
    riskRewardRatio: 2,           // minimum risk/reward ratio
  },

  // ── Execution ─────────────────────────────────────────────────────
  paperTrading: process.env.PAPER_TRADING === 'true',
  initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL || '60000', 10),

  // ── Logging ───────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info', // debug | info | warn | error
};
