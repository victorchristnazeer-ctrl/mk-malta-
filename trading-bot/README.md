# Trading Bot

A modular trading bot with multiple strategies, risk management, backtesting, and paper trading.

> **Disclaimer**: This bot is for educational and research purposes. No trading strategy guarantees profits. Past performance (including backtests) does not predict future results. Always use paper trading first and never risk money you cannot afford to lose.

## Features

- **4 Technical Strategies**: EMA Crossover, RSI, MACD, Bollinger Bands
- **Combined Strategy**: Requires multiple strategy confirmations to reduce false signals
- **Risk Management**: Stop-loss, take-profit, trailing stops, position sizing, daily loss limits, max drawdown protection
- **Backtesting Engine**: Test strategies against synthetic market data
- **Paper Trading Mode**: Practice without risking real money
- **Zero Dependencies**: Built with pure Node.js — no npm install required

## Quick Start

```bash
# Run backtester (no API keys needed)
node src/backtest.js

# Run paper trading
PAPER_TRADING=true node src/index.js

# Run tests
node tests/run-tests.js
```

## Strategies

| Strategy | Type | Description |
|----------|------|-------------|
| `ema_crossover` | Trend-following | Buys on fast/slow EMA crossovers |
| `rsi` | Mean-reversion | Buys oversold bounces, sells overbought reversals |
| `macd` | Momentum | Buys/sells on MACD/signal line crossovers |
| `bollinger` | Mean-reversion | Trades Bollinger Band bounces |
| `combined` | Multi-signal | Requires 2+ strategies to agree (default) |

## Configuration

Set via environment variables or edit `config/default.js`:

```bash
STRATEGY=combined        # Strategy to use
SYMBOL=BTC/USDT          # Trading pair
TIMEFRAME=1h             # Candle interval
PAPER_TRADING=true       # Paper trading mode
INITIAL_BALANCE=10000    # Starting balance
LOG_LEVEL=info           # debug|info|warn|error
```

## Risk Management

- **Position sizing**: Risk-based sizing (default 2% of portfolio per trade)
- **Stop-loss**: Automatic stop-loss (default 2%)
- **Take-profit**: Automatic take-profit (default 4%)
- **Trailing stop**: Locks in profits as price moves favorably
- **Daily loss limit**: Halts trading if daily losses exceed threshold
- **Max drawdown**: Emergency halt if total drawdown exceeds limit
- **Risk/reward filter**: Only takes trades with favorable risk/reward ratio

## Architecture

```
trading-bot/
├── config/
│   └── default.js              # All configuration
├── src/
│   ├── index.js                # Live/paper trading entry point
│   ├── backtest.js             # Backtesting entry point
│   ├── strategies/
│   │   ├── base-strategy.js    # Strategy interface
│   │   ├── ema-crossover.js    # EMA crossover strategy
│   │   ├── rsi-strategy.js     # RSI strategy
│   │   ├── macd-strategy.js    # MACD strategy
│   │   ├── bollinger-strategy.js # Bollinger Bands strategy
│   │   └── combined-strategy.js  # Multi-strategy confirmation
│   ├── engines/
│   │   ├── trading-engine.js   # Live trading loop
│   │   ├── backtester.js       # Backtesting engine
│   │   ├── risk-manager.js     # Risk management
│   │   ├── portfolio.js        # Portfolio & position tracking
│   │   └── data-feed.js        # Market data generation
│   └── utils/
│       ├── indicators.js       # Technical indicators (SMA, EMA, RSI, MACD, BB, ATR)
│       └── logger.js           # Structured logger
└── tests/
    └── run-tests.js            # Test suite
```

## Going Live

To connect to a real exchange, replace the `DataFeed` with an exchange API client:

1. Install [ccxt](https://github.com/ccxt/ccxt): `npm install ccxt`
2. Configure API keys in environment variables
3. Replace `DataFeed.generateTrendingMarket()` calls with real OHLCV data fetching
4. **Start with paper trading and small amounts**
