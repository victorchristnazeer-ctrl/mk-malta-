/**
 * Crypto Data Feed – fetches real OHLCV data from Binance public API.
 * No API key required for public market data endpoints.
 */
const https = require('https');

class CryptoDataFeed {
  /**
   * Fetch OHLCV candles from Binance.
   * @param {string} symbol - e.g. 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'
   * @param {string} interval - e.g. '1h', '4h', '1d'
   * @param {number} limit - number of candles (max 1000)
   * @param {number} [startTime] - start time in ms (optional)
   * @param {number} [endTime] - end time in ms (optional)
   * @returns {Promise<Array>} Array of { time, open, high, low, close, volume }
   */
  static fetch(symbol, interval = '1h', limit = 500, startTime, endTime) {
    return new Promise((resolve, reject) => {
      let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      if (startTime) url += `&startTime=${startTime}`;
      if (endTime) url += `&endTime=${endTime}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const raw = JSON.parse(data);
            if (raw.code) {
              reject(new Error(`Binance API error: ${raw.msg}`));
              return;
            }
            const candles = raw.map((k) => ({
              time: new Date(k[0]).toISOString(),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
            }));
            resolve(candles);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Fetch extended history by paginating through Binance API.
   * @param {string} symbol
   * @param {string} interval
   * @param {number} totalCandles - total candles desired
   * @returns {Promise<Array>}
   */
  static async fetchExtended(symbol, interval = '1h', totalCandles = 1000) {
    const intervalMs = {
      '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
      '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000,
      '6h': 21600000, '8h': 28800000, '12h': 43200000, '1d': 86400000,
      '3d': 259200000, '1w': 604800000,
    };

    const msPerCandle = intervalMs[interval] || 3600000;
    const now = Date.now();
    const allCandles = [];
    let endTime = now;
    let remaining = totalCandles;

    while (remaining > 0) {
      const batchSize = Math.min(remaining, 1000);
      const startTime = endTime - batchSize * msPerCandle;
      const batch = await this.fetch(symbol, interval, batchSize, startTime, endTime - 1);

      if (batch.length === 0) break;
      allCandles.unshift(...batch);
      endTime = startTime;
      remaining -= batch.length;

      // Small delay to respect rate limits
      if (remaining > 0) await new Promise((r) => setTimeout(r, 200));
    }

    // De-duplicate by time
    const seen = new Set();
    const unique = allCandles.filter((c) => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    });

    return unique.slice(-totalCandles);
  }
}

module.exports = CryptoDataFeed;
