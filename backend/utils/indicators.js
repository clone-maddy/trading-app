/**
 * Calculate Exponential Moving Average (EMA) for a series of candles
 * @param {Array} candles - Array of candle objects, each containing a "close" field (number)
 * @param {number} period - EMA period (e.g. 9 or 21)
 * @returns {Array} - Array of EMA values (same length as input candles, null for indices < period - 1)
 */
const calculateEMA = (candles, period) => {
  if (!Array.isArray(candles) || candles.length < period) {
    return new Array(candles ? candles.length : 0).fill(null);
  }

  const emaValues = new Array(candles.length).fill(null);
  const multiplier = 2 / (period + 1);

  // 1. Calculate Simple Moving Average (SMA) for the first 'period' candles
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  const initialSMA = sum / period;
  emaValues[period - 1] = Number(initialSMA.toFixed(4));

  // 2. Calculate subsequent EMA values
  for (let i = period; i < candles.length; i++) {
    const close = candles[i].close;
    const prevEMA = emaValues[i - 1];
    const currEMA = (close - prevEMA) * multiplier + prevEMA;
    emaValues[i] = Number(currEMA.toFixed(4));
  }

  return emaValues;
};

module.exports = { calculateEMA };
