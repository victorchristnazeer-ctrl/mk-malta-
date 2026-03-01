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
      minConfirmations: 2,        // 2/4 strategies must agree (raised confidence compensates)
      minConfidence: 20,          // higher median confidence filter for quality signals
    },
  },

  // ── Risk management ───────────────────────────────────────────────
  risk: {
    maxPositionSizePct: 2,        // risk 2% of portfolio per trade
    stopLossPct: 3,               // stop-loss wide enough to avoid noise
    takeProfitPct: 6,             // 2:1 reward-to-risk ratio
    trailingStopPct: 2.5,         // trailing stop – lock in profits without noise exits
    maxOpenPositions: 3,          // allow up to 3 concurrent positions
    maxDailyLossPct: 5,           // daily loss limit
    maxDrawdownPct: 15,           // max total drawdown before halting
    riskRewardRatio: 1.5,         // only take trades with favorable R:R
    minConfidence: 15,            // minimum strategy confidence to enter trade
    maxBarsInTrade: 100,          // auto-close positions held longer than this
  },

  // ── Trading cost simulation (for backtesting realism) ────────
  tradingCosts: {
    slippageBps: 3,          // 3 basis points slippage per side
    spreadBps: 2,            // 2 bps half-spread
    commissionBps: 10,       // 10 bps (0.1%) Binance taker fee
    stopSlippageBps: 8,      // extra slippage on stop-loss fills
  },

  // ── Execution ─────────────────────────────────────────────────────
  paperTrading: process.env.PAPER_TRADING === 'true',
  initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL || '60000', 10),

  // ── Symbol-specific parameter overrides ──────────────────────────
  // These override the base strategy params when trading specific symbols.
  // Volatile assets use longer periods; stable assets use shorter ones.
  symbolProfiles: {
    'BTC/USDT': {
      ema_crossover: { fastPeriod: 10, slowPeriod: 26, trendPeriod: 55 },
      rsi: { period: 14, overbought: 72, oversold: 28, trendPeriod: 55 },
      macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, trendPeriod: 55 },
      bollinger: { period: 20, stdDev: 2.2, trendPeriod: 55 },
      risk: { stopLossPct: 3, takeProfitPct: 7, trailingStopPct: 2.5 },
    },
    'ETH/USDT': {
      ema_crossover: { fastPeriod: 8, slowPeriod: 21, trendPeriod: 50 },
      rsi: { period: 14, overbought: 70, oversold: 30, trendPeriod: 50 },
      macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, trendPeriod: 50 },
      bollinger: { period: 20, stdDev: 2, trendPeriod: 50 },
      risk: { stopLossPct: 3, takeProfitPct: 6, trailingStopPct: 2 },
    },
    'SOL/USDT': {
      ema_crossover: { fastPeriod: 6, slowPeriod: 18, trendPeriod: 40 },
      rsi: { period: 12, overbought: 68, oversold: 32, trendPeriod: 40 },
      macd: { fastPeriod: 10, slowPeriod: 22, signalPeriod: 7, trendPeriod: 40 },
      bollinger: { period: 18, stdDev: 2.5, trendPeriod: 40 },
      risk: { stopLossPct: 4, takeProfitPct: 8, trailingStopPct: 3 },
    },
  },

  // ── Logging ───────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info', // debug | info | warn | error
};
