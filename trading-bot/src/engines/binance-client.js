/**
 * Binance REST Client – handles real order placement and account queries.
 * Uses native Node.js https (no external dependencies).
 *
 * For paper trading, this module is NOT used – the TradingEngine
 * simulates orders internally.
 */
const https = require('https');
const crypto = require('crypto');

class BinanceClient {
  constructor({ apiKey, apiSecret, testnet = false }, logger) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = testnet
      ? 'testnet.binance.vision'
      : 'api.binance.com';
    this.log = logger;
  }

  /**
   * Sign request params with HMAC-SHA256.
   */
  _sign(queryString) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Make an authenticated API request.
   */
  _request(method, path, params = {}, signed = false) {
    return new Promise((resolve, reject) => {
      params.timestamp = Date.now();
      const qs = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');

      let fullQs = qs;
      if (signed) {
        fullQs = `${qs}&signature=${this._sign(qs)}`;
      }

      const fullPath = method === 'GET'
        ? `${path}?${fullQs}`
        : path;

      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: fullPath,
        method,
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.code && parsed.code < 0) {
              reject(new Error(`Binance API error ${parsed.code}: ${parsed.msg}`));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);

      if (method === 'POST' || method === 'DELETE') {
        req.write(fullQs);
      }

      req.end();
    });
  }

  // ── Public endpoints (no auth needed) ─────────────────────────────

  /**
   * Get current price for a symbol.
   */
  async getPrice(symbol) {
    const data = await this._request('GET', '/api/v3/ticker/price', { symbol }, false);
    return parseFloat(data.price);
  }

  /**
   * Get OHLCV candles.
   */
  async getCandles(symbol, interval, limit = 100) {
    const data = await this._request('GET', '/api/v3/klines', {
      symbol, interval, limit,
    }, false);
    return data.map((k) => ({
      time: new Date(k[0]).toISOString(),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /**
   * Get exchange info for a symbol (lot size, price precision, etc.)
   */
  async getSymbolInfo(symbol) {
    const data = await this._request('GET', '/api/v3/exchangeInfo', { symbol }, false);
    const sym = data.symbols.find((s) => s.symbol === symbol);
    if (!sym) throw new Error(`Symbol ${symbol} not found`);

    const lotFilter = sym.filters.find((f) => f.filterType === 'LOT_SIZE');
    const priceFilter = sym.filters.find((f) => f.filterType === 'PRICE_FILTER');
    const minNotional = sym.filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');

    return {
      symbol: sym.symbol,
      status: sym.status,
      baseAsset: sym.baseAsset,
      quoteAsset: sym.quoteAsset,
      minQty: parseFloat(lotFilter?.minQty || '0.00001'),
      maxQty: parseFloat(lotFilter?.maxQty || '99999'),
      stepSize: parseFloat(lotFilter?.stepSize || '0.00001'),
      tickSize: parseFloat(priceFilter?.tickSize || '0.01'),
      minNotional: parseFloat(minNotional?.minNotional || minNotional?.notional || '10'),
    };
  }

  // ── Authenticated endpoints ──────────────────────────────────────

  /**
   * Get account balance.
   */
  async getBalance() {
    const data = await this._request('GET', '/api/v3/account', {}, true);
    const balances = {};
    for (const b of data.balances) {
      const free = parseFloat(b.free);
      const locked = parseFloat(b.locked);
      if (free > 0 || locked > 0) {
        balances[b.asset] = { free, locked, total: free + locked };
      }
    }
    return balances;
  }

  /**
   * Place a MARKET order.
   */
  async marketOrder(symbol, side, quantity) {
    this.log.info(`Placing ${side} MARKET order: ${quantity} ${symbol}`);
    const data = await this._request('POST', '/api/v3/order', {
      symbol,
      side,         // BUY or SELL
      type: 'MARKET',
      quantity: this._formatQty(quantity),
    }, true);
    this.log.info(`Order filled: ${data.executedQty} @ avg price ${data.fills?.[0]?.price || 'N/A'}`);
    return data;
  }

  /**
   * Place a LIMIT order.
   */
  async limitOrder(symbol, side, quantity, price) {
    this.log.info(`Placing ${side} LIMIT order: ${quantity} ${symbol} @ ${price}`);
    const data = await this._request('POST', '/api/v3/order', {
      symbol,
      side,
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity: this._formatQty(quantity),
      price: this._formatPrice(price),
    }, true);
    return data;
  }

  /**
   * Place a STOP-LOSS LIMIT order.
   */
  async stopLossOrder(symbol, side, quantity, stopPrice, price) {
    this.log.info(`Placing ${side} STOP_LOSS_LIMIT: ${quantity} ${symbol} stop@${stopPrice} limit@${price}`);
    const data = await this._request('POST', '/api/v3/order', {
      symbol,
      side,
      type: 'STOP_LOSS_LIMIT',
      timeInForce: 'GTC',
      quantity: this._formatQty(quantity),
      stopPrice: this._formatPrice(stopPrice),
      price: this._formatPrice(price),
    }, true);
    return data;
  }

  /**
   * Cancel an order.
   */
  async cancelOrder(symbol, orderId) {
    this.log.info(`Cancelling order ${orderId} on ${symbol}`);
    return this._request('DELETE', '/api/v3/order', {
      symbol, orderId,
    }, true);
  }

  /**
   * Get open orders for a symbol.
   */
  async getOpenOrders(symbol) {
    return this._request('GET', '/api/v3/openOrders', { symbol }, true);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  _formatQty(qty) {
    return parseFloat(qty).toFixed(6);
  }

  _formatPrice(price) {
    return parseFloat(price).toFixed(2);
  }
}

module.exports = BinanceClient;
