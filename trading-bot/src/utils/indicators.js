/**
 * Technical indicators – pure functions, no external dependencies.
 * Each function takes an array of numbers (typically close prices)
 * and returns the computed indicator values.
 */

/**
 * Simple Moving Average
 */
function sma(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

/**
 * Exponential Moving Average
 */
function ema(data, period) {
  const result = [];
  const k = 2 / (period + 1);
  let prev = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (prev === null) {
      // seed with SMA
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      prev = sum / period;
    } else {
      prev = data[i] * k + prev * (1 - k);
    }
    result.push(prev);
  }
  return result;
}

/**
 * Relative Strength Index
 */
function rsi(data, period = 14) {
  const result = [];
  const gains = [];
  const losses = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);

    if (i < period) {
      result.push(null);
      continue;
    }

    let avgGain, avgLoss;
    if (i === period) {
      avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      const prevRsiData = result[i - 1] === null ? 50 : result[i - 1];
      const prevAvgLoss = prevRsiData === 100 ? 0 : 1;
      // Use Wilder's smoothing
      avgGain = gains.slice(Math.max(0, gains.length - period), gains.length)
        .reduce((a, b) => a + b, 0) / period;
      avgLoss = losses.slice(Math.max(0, losses.length - period), losses.length)
        .reduce((a, b) => a + b, 0) / period;
    }

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }
  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * Returns { macd, signal, histogram }
 */
function macd(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = ema(data, fastPeriod);
  const slowEma = ema(data, slowPeriod);

  const macdLine = fastEma.map((f, i) => {
    if (f === null || slowEma[i] === null) return null;
    return f - slowEma[i];
  });

  const validMacd = macdLine.filter((v) => v !== null);
  const signalLine = ema(validMacd, signalPeriod);

  // Pad signal line to match original length
  const padLen = macdLine.length - validMacd.length;
  const signalPadded = Array(padLen).fill(null);

  let si = 0;
  for (let i = padLen; i < macdLine.length; i++) {
    signalPadded.push(signalLine[si] || null);
    si++;
  }

  const histogram = macdLine.map((m, i) => {
    if (m === null || signalPadded[i] === null) return null;
    return m - signalPadded[i];
  });

  return { macd: macdLine, signal: signalPadded, histogram };
}

/**
 * Bollinger Bands
 * Returns { upper, middle, lower }
 */
function bollingerBands(data, period = 20, numStdDev = 2) {
  const middle = sma(data, period);
  const upper = [];
  const lower = [];

  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (data[j] - middle[i]) ** 2;
    }
    const stdDev = Math.sqrt(sumSq / period);
    upper.push(middle[i] + numStdDev * stdDev);
    lower.push(middle[i] - numStdDev * stdDev);
  }

  return { upper, middle, lower };
}

/**
 * Average True Range
 */
function atr(highs, lows, closes, period = 14) {
  const trueRanges = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      trueRanges.push(highs[i] - lows[i]);
      continue;
    }
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  return sma(trueRanges, period);
}

module.exports = { sma, ema, rsi, macd, bollingerBands, atr };
