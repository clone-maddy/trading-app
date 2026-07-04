const { calculateEMA } = require('../utils/indicators');

// In-memory state: token -> { lastCrossState: 'above' | 'below' | null, lastAlertTime: timestamp }
const tokenStates = new Map();

/**
 * Check for EMA 9 / EMA 21 crossover
 * @param {string} token - The scrip master token ID
 * @param {Array} candles - Array of candle objects { time, open, high, low, close, volume }
 * @param {number} liveLtp - Optional live LTP from websocket tick (added as temporary latest candle close)
 * @param {number} intervalMs - Lockout interval in ms (e.g. 60000 for 1m block) to prevent multi-fires
 * @returns {Object|null} - Crossover alert payload or null
 */
const checkEMACrossover = (token, candles, liveLtp = null, intervalMs = 60000) => {
  if (!Array.isArray(candles) || candles.length === 0) {
    return null;
  }

  // Clone candles so we don't mutate caller's history list
  const tempCandles = [...candles];

  // If a live LTP is provided, construct a temporary candle for the current live tick
  if (liveLtp !== null && liveLtp > 0) {
    // If the last candle has the same timestamp as the current live minute/block, we can just replace its close
    // Otherwise, append a temporary candle at the end of the history array
    const lastIdx = tempCandles.length - 1;
    tempCandles[lastIdx] = {
      ...tempCandles[lastIdx],
      close: liveLtp
    };
  }

  // We need at least 21 candles to calculate a valid 21 EMA value
  if (tempCandles.length < 21) {
    return null;
  }

  // Calculate EMA 9 and EMA 21 arrays
  const ema9 = calculateEMA(tempCandles, 9);
  const ema21 = calculateEMA(tempCandles, 21);

  const n = tempCandles.length;
  // Verify that the last two elements have valid computed values
  if (ema9[n - 1] === null || ema21[n - 1] === null || ema9[n - 2] === null || ema21[n - 2] === null) {
    return null;
  }

  const prevEma9 = ema9[n - 2];
  const prevEma21 = ema21[n - 2];
  const currEma9 = ema9[n - 1];
  const currEma21 = ema21[n - 1];

  let state = tokenStates.get(token);
  if (!state) {
    // Prime the baseline state on first load and exit (prevents spamming alerts on startup)
    const initialRelation = currEma9 > currEma21 ? 'above' : (currEma9 < currEma21 ? 'below' : null);
    state = {
      lastCrossState: initialRelation,
      lastAlertTime: 0
    };
    tokenStates.set(token, state);
    console.log(`🔌 Primed EMA alerts engine for ${token}: state is currently ${initialRelation}`);
    return null;
  }

  let crossoverType = null;

  // Bearish crossover: 9 EMA crosses 21 EMA from above
  if (prevEma9 >= prevEma21 && currEma9 < currEma21) {
    if (state.lastCrossState !== 'below') {
      crossoverType = 'bearish';
    }
  }
  // Bullish crossover: 9 EMA crosses 21 EMA from below
  else if (prevEma9 <= prevEma21 && currEma9 > currEma21) {
    if (state.lastCrossState !== 'above') {
      crossoverType = 'bullish';
    }
  }

  if (crossoverType) {
    const now = Date.now();
    // Whipsaw Lockout check: ensure we do not trigger more than once per candle interval
    if (now - state.lastAlertTime >= intervalMs) {
      state.lastCrossState = crossoverType === 'bullish' ? 'above' : 'below';
      state.lastAlertTime = now;

      const latestCandle = tempCandles[n - 1];
      return {
        type: crossoverType,
        token,
        timestamp: latestCandle.time || new Date().toISOString(),
        ema9: Number(currEma9.toFixed(2)),
        ema21: Number(currEma21.toFixed(2)),
        ltp: liveLtp || latestCandle.close
      };
    }
  } else {
    // If no crossover has occurred, ensure we update the baseline state if the lines drift apart
    // (e.g. in case the baseline state was null due to equal lines)
    const currentRelation = currEma9 > currEma21 ? 'above' : (currEma9 < currEma21 ? 'below' : null);
    if (currentRelation && state.lastCrossState === null) {
      state.lastCrossState = currentRelation;
    }
  }

  return null;
};

module.exports = {
  checkEMACrossover,
  tokenStates
};
