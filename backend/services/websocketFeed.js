const { WebSocketV2 } = require('smartapi-javascript');
const { connectAngelOne } = require('./angelone');
const User = require('../models/User');

let wsInstance = null;
let isConnected = false;
let subscribedTokens = new Set();
let priceCache = new Map(); // token -> ltp
let candleCache = new Map(); // token -> { lastCandleTime, candles: [] }
let tickCallbacks = [];
let reconnectTimer = null;
let crossoverCallback = null;

// Initialize and connect the WebSocket
const initWebSocket = async (userId) => {
  if (isConnected && wsInstance) {
    console.log('WebSocket already connected');
    return;
  }

  try {
    let targetUserId = userId;

    if (!targetUserId) {
      // Find first user with broker config to prime feed
      const user = await User.findOne({ angelClientId: { $exists: true, $ne: '' } });
      if (!user) {
        console.log('⚠️ No users with configured broker credentials found. WebSocket feed connection deferred.');
        return;
      }
      targetUserId = user._id;
    }

    const { authToken, feedToken } = await connectAngelOne(targetUserId);
    const user = await User.findById(targetUserId);

    wsInstance = new WebSocketV2({
      jwttoken: authToken,
      apikey: process.env.ANGEL_API_KEY || user.angelApiKey,
      clientcode: user.angelClientId,
      feedtype: feedToken
    });

    // Enable auto-reconnect (5 second delay)
    wsInstance.reconnection('simple', 5000);

    await wsInstance.connect();
    isConnected = true;
    console.log(`✅ AngelOne WebSocket connected successfully using session for user: ${targetUserId}!`);

    // Listen for tick data
    wsInstance.on('tick', (data) => {
      if (!data || !data.token) return;

      // Clean the token string (padded with null chars, remove all non-digits)
      const token = data.token.replace(/\D/g, '');
      // LTP comes as string in paisa, convert to rupees
      const ltp = parseFloat(data.last_traded_price || 0) / 100;

      if (token && ltp > 0) {
        priceCache.set(token, ltp);

        const updateData = { token, ltp };
        if (data.open_interest !== undefined) {
          updateData.oi = parseInt(data.open_interest);
        }
        if (data.vol_traded !== undefined) {
          updateData.volume = parseInt(data.vol_traded);
        }
        if (data.best_5_buy_data?.[0]?.price !== undefined) {
          updateData.bid = parseFloat(data.best_5_buy_data[0].price) / 100;
        }
        if (data.best_5_sell_data?.[0]?.price !== undefined) {
          updateData.ask = parseFloat(data.best_5_sell_data[0].price) / 100;
        }

        // Update candle cache and check for crossovers
        const cState = candleCache.get(token);
        if (cState) {
          const nowMs = Date.now();
          // Use 1-minute blocks (60000ms) for high-frequency EMA crossover monitoring
          const currentBoundary = Math.floor(nowMs / 60000) * 60000;

          if (currentBoundary === cState.lastCandleTime) {
            // Update current developing candle
            const currentCandle = cState.candles[cState.candles.length - 1];
            if (currentCandle) {
              currentCandle.close = ltp;
              if (ltp > currentCandle.high) currentCandle.high = ltp;
              if (ltp < currentCandle.low) currentCandle.low = ltp;
              if (data.vol_traded !== undefined) {
                currentCandle.volume = parseInt(data.vol_traded);
              }
            }

            // Real-time live-tick crossover check with Whipsaw Lockout protection
            const { checkEMACrossover } = require('./alertsEngine');
            const crossover = checkEMACrossover(token, cState.candles, ltp, 60000);
            if (crossover && crossoverCallback) {
              crossoverCallback(token, crossover);
            }

          } else if (currentBoundary > cState.lastCandleTime) {
            // The previous developing candle has now CLOSED!
            const closedCandle = cState.candles[cState.candles.length - 1];
            console.log(`🕯️ Candle closed for ${token} at ${closedCandle ? closedCandle.time : ''}. Finalizing crossover check...`);

            // Evaluate crossover on the finalized historical candles
            const { checkEMACrossover } = require('./alertsEngine');
            const crossover = checkEMACrossover(token, cState.candles, null, 60000);
            if (crossover && crossoverCallback) {
              crossoverCallback(token, crossover);
            }

            // Start a new 1-minute candle
            const newCandle = {
              time: new Date(currentBoundary).toISOString(),
              open: ltp,
              high: ltp,
              low: ltp,
              close: ltp,
              volume: data.vol_traded !== undefined ? parseInt(data.vol_traded) : 0
            };
            cState.candles.push(newCandle);
            cState.lastCandleTime = currentBoundary;

            // Keep cache size bounded to last 200 candles
            if (cState.candles.length > 200) {
              cState.candles.shift();
            }
          }
        }

        // Notify all registered callbacks
        tickCallbacks.forEach(cb => {
          try {
            cb(updateData);
          } catch (err) {
            console.log('Tick callback error:', err.message);
          }
        });
      }
    });

    // Prime configurations from database AlertConfig schema
    try {
      const AlertConfig = require('../models/AlertConfig');
      const activeConfigs = await AlertConfig.find({});
      const configTokens = activeConfigs.map(c => c.token);
      if (configTokens.length > 0) {
        console.log(`🔌 Priming ${configTokens.length} active user alert configs on websocket feed...`);
        setTimeout(() => subscribeTokens(configTokens), 1500);
      }
    } catch (err) {
      console.log('Error priming alert configs on startup:', err.message);
    }

    // Re-subscribe previously subscribed tokens after reconnect
    if (subscribedTokens.size > 0) {
      const tokens = Array.from(subscribedTokens);
      console.log(`Re-subscribing ${tokens.length} tokens after reconnect...`);
      await _subscribeInBatches(tokens);
    }

  } catch (error) {
    isConnected = false;
    console.log('❌ WebSocket connection failed:', error.message);

    // Retry connection after 10 seconds
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        console.log('Retrying WebSocket connection...');
        await initWebSocket();
      }, 10000);
    }
  }
};

// Subscribe to tokens (NFO options)
const subscribeTokens = async (tokens, userId) => {
  if (!tokens || tokens.length === 0) return;

  // Filter out already subscribed tokens
  const newTokens = tokens.filter(t => !subscribedTokens.has(t));
  if (newTokens.length === 0) {
    console.log('All tokens already subscribed');
    return;
  }

  // Ensure WebSocket is connected
  if (!isConnected) {
    await initWebSocket(userId);
  }

  // Add to tracking set
  newTokens.forEach(t => subscribedTokens.add(t));

  await _subscribeInBatches(newTokens);
  console.log(`📡 Subscribed to ${newTokens.length} new tokens (total: ${subscribedTokens.size})`);

  // Initialize candleCache and prime alertsEngine crossover states
  const { getCandleData } = require('./optionChain');
  const { checkEMACrossover } = require('./alertsEngine');

  newTokens.forEach(async (token) => {
    try {
      const exchange = INDEX_TOKENS.has(token) ? 'NSE' : 'NFO';
      // Fetch 100 candles of ONE_MINUTE interval to populate baseline
      const rawData = await getCandleData(token, exchange, 'ONE_MINUTE', userId);
      if (Array.isArray(rawData)) {
        const formatted = rawData.map(c => ({
          time: c[0],
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
          volume: Number(c[5])
        }));

        if (formatted.length > 0) {
          const lastCandleTime = Math.floor(new Date(formatted[formatted.length - 1].time).getTime() / 60000) * 60000;
          candleCache.set(token, {
            lastCandleTime,
            candles: formatted
          });
          
          // Prime alertsEngine crossover baseline with historical data
          checkEMACrossover(token, formatted);
          console.log(`🕯️ Populated candle cache for ${token} with ${formatted.length} candles.`);
        }
      }
    } catch (err) {
      console.log(`Failed to pre-fetch candles for token ${token}:`, err.message);
    }
  });
};

const INDEX_TOKENS = new Set(['99926000', '99926009', '99926037']);

// Internal: subscribe in batches of 1000 (AngelOne limit)
const _subscribeInBatches = async (tokens) => {
  const indexTokens = tokens.filter(t => INDEX_TOKENS.has(t));
  const foTokens = tokens.filter(t => !INDEX_TOKENS.has(t));

  if (indexTokens.length > 0) {
    _subscribeSegment(indexTokens, 1);
  }
  if (foTokens.length > 0) {
    _subscribeSegment(foTokens, 2);
  }
};

const _subscribeSegment = (tokens, exchangeType) => {
  const batchSize = 1000;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    try {
      wsInstance.fetchData({
        correlationID: `sub_${Date.now()}_${exchangeType}_${i}`,
        action: 1,        // Subscribe
        mode: exchangeType === 1 ? 1 : 3, // mode 1 for index spot (LTP), mode 3 for options (SNAP_QUOTE)
        exchangeType: exchangeType,
        tokens: batch
      });
    } catch (err) {
      console.log(`Subscribe batch ${i} (exchange ${exchangeType}) error:`, err.message);
    }
  }
};

// Unsubscribe from tokens
const unsubscribeTokens = async (tokens) => {
  if (!tokens || tokens.length === 0 || !isConnected || !wsInstance) return;

  const toRemove = tokens.filter(t => subscribedTokens.has(t));
  if (toRemove.length === 0) return;

  // Remove from tracking
  toRemove.forEach(t => subscribedTokens.delete(t));

  const indexTokens = toRemove.filter(t => INDEX_TOKENS.has(t));
  const foTokens = toRemove.filter(t => !INDEX_TOKENS.has(t));

  if (indexTokens.length > 0) {
    _unsubscribeSegment(indexTokens, 1);
  }
  if (foTokens.length > 0) {
    _unsubscribeSegment(foTokens, 2);
  }

  // Clean price cache for removed tokens
  toRemove.forEach(t => {
    priceCache.delete(t);
    candleCache.delete(t);
    const { tokenStates } = require('./alertsEngine');
    tokenStates.delete(t);
  });
  console.log(`🔕 Unsubscribed ${toRemove.length} tokens (remaining: ${subscribedTokens.size})`);
};

const _unsubscribeSegment = (tokens, exchangeType) => {
  const batchSize = 1000;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    try {
      wsInstance.fetchData({
        correlationID: `unsub_${Date.now()}_${exchangeType}_${i}`,
        action: 0,         // Unsubscribe
        mode: 1,
        exchangeType: exchangeType,
        tokens: batch
      });
    } catch (err) {
      console.log(`Unsubscribe batch ${i} (exchange ${exchangeType}) error:`, err.message);
    }
  }
};

// Register a callback to receive tick data
const onTick = (callback) => {
  tickCallbacks.push(callback);
};

const onCrossover = (callback) => {
  crossoverCallback = callback;
};

// Get cached price for a token
const getCachedPrice = (token) => {
  return priceCache.get(token) || null;
};

// Get all cached prices
const getAllCachedPrices = () => {
  return Object.fromEntries(priceCache);
};

// Get connection status
const getStatus = () => ({
  connected: isConnected,
  subscribedCount: subscribedTokens.size,
  cacheSize: priceCache.size
});

module.exports = {
  initWebSocket,
  subscribeTokens,
  unsubscribeTokens,
  onTick,
  onCrossover,
  getCachedPrice,
  getAllCachedPrices,
  getStatus
};
