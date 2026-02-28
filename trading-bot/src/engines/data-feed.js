/**
 * Data Feed – generates synthetic market data for testing / paper trading.
 * In production, replace this with real exchange API calls (e.g. via ccxt).
 */

class DataFeed {
  /**
   * Generate synthetic OHLCV candles using geometric Brownian motion.
   * Useful for backtesting without needing an API key.
   */
  static generateSyntheticCandles({
    startPrice = 40000,
    numCandles = 500,
    volatility = 0.02,
    trend = 0.0001,       // slight upward drift
    startDate = new Date('2025-01-01'),
    intervalMs = 3600000, // 1 hour
  } = {}) {
    const candles = [];
    let price = startPrice;

    for (let i = 0; i < numCandles; i++) {
      const time = new Date(startDate.getTime() + i * intervalMs).toISOString();

      // Geometric Brownian motion
      const randomWalk = (Math.random() - 0.5) * 2 * volatility;
      const change = 1 + trend + randomWalk;
      const open = price;
      price *= change;
      const close = price;

      // Generate high/low around open-close range
      const range = Math.abs(open - close);
      const high = Math.max(open, close) + Math.random() * range * 0.5;
      const low = Math.min(open, close) - Math.random() * range * 0.5;
      const volume = 100 + Math.random() * 900;

      candles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: parseFloat(volume.toFixed(2)),
      });
    }
    return candles;
  }

  /**
   * Generate candles with specific market patterns for more realistic testing.
   */
  static generateTrendingMarket({
    startPrice = 40000,
    numCandles = 500,
    startDate = new Date('2025-01-01'),
    intervalMs = 3600000,
  } = {}) {
    const candles = [];
    let price = startPrice;
    let phase = 'uptrend';
    let phaseCounter = 0;
    const phaseLengths = {
      uptrend: 50 + Math.floor(Math.random() * 50),
      consolidation: 20 + Math.floor(Math.random() * 30),
      downtrend: 40 + Math.floor(Math.random() * 40),
      recovery: 30 + Math.floor(Math.random() * 30),
    };

    for (let i = 0; i < numCandles; i++) {
      const time = new Date(startDate.getTime() + i * intervalMs).toISOString();
      phaseCounter++;

      let drift, vol;
      switch (phase) {
        case 'uptrend':
          drift = 0.001 + Math.random() * 0.002;
          vol = 0.01;
          if (phaseCounter > phaseLengths.uptrend) {
            phase = 'consolidation';
            phaseCounter = 0;
            phaseLengths.consolidation = 20 + Math.floor(Math.random() * 30);
          }
          break;
        case 'consolidation':
          drift = (Math.random() - 0.5) * 0.001;
          vol = 0.005;
          if (phaseCounter > phaseLengths.consolidation) {
            phase = Math.random() > 0.5 ? 'downtrend' : 'uptrend';
            phaseCounter = 0;
          }
          break;
        case 'downtrend':
          drift = -0.001 - Math.random() * 0.002;
          vol = 0.015;
          if (phaseCounter > phaseLengths.downtrend) {
            phase = 'recovery';
            phaseCounter = 0;
            phaseLengths.recovery = 30 + Math.floor(Math.random() * 30);
          }
          break;
        case 'recovery':
          drift = 0.0005 + Math.random() * 0.001;
          vol = 0.008;
          if (phaseCounter > phaseLengths.recovery) {
            phase = 'uptrend';
            phaseCounter = 0;
            phaseLengths.uptrend = 50 + Math.floor(Math.random() * 50);
          }
          break;
      }

      const randomWalk = (Math.random() - 0.5) * 2 * vol;
      const open = price;
      price *= 1 + drift + randomWalk;
      const close = price;
      const range = Math.abs(open - close);
      const high = Math.max(open, close) + Math.random() * range * 0.5;
      const low = Math.min(open, close) - Math.random() * range * 0.5;
      const volume = (phase === 'downtrend' ? 500 : 200) + Math.random() * 800;

      candles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: parseFloat(volume.toFixed(2)),
      });
    }
    return candles;
  }
}

module.exports = DataFeed;
