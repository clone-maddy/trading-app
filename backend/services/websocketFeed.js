const { WebSocketV2 } = require('smartapi-javascript');
const { connectAngelOne } = require('./angelone');

let wsInstance = null;
let isConnected = false;
let subscribedTokens = new Set();
let priceCache = new Map(); // token -> ltp
let tickCallbacks = [];
let reconnectTimer = null;

// Initialize and connect the WebSocket
const initWebSocket = async () => {
  if (isConnected && wsInstance) {
    console.log('WebSocket already connected');
    return;
  }

  try {
    const { authToken, feedToken } = await connectAngelOne();

    wsInstance = new WebSocketV2({
      jwttoken: authToken,
      apikey: process.env.ANGEL_API_KEY,
      clientcode: process.env.ANGEL_CLIENT_ID,
      feedtype: feedToken
    });

    // Enable auto-reconnect (5 second delay)
    wsInstance.reconnection('simple', 5000);

    await wsInstance.connect();
    isConnected = true;
    console.log('✅ AngelOne WebSocket connected!');

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
const subscribeTokens = async (tokens) => {
  if (!tokens || tokens.length === 0) return;

  // Filter out already subscribed tokens
  const newTokens = tokens.filter(t => !subscribedTokens.has(t));
  if (newTokens.length === 0) {
    console.log('All tokens already subscribed');
    return;
  }

  // Ensure WebSocket is connected
  if (!isConnected) {
    await initWebSocket();
  }

  // Add to tracking set
  newTokens.forEach(t => subscribedTokens.add(t));

  await _subscribeInBatches(newTokens);
  console.log(`📡 Subscribed to ${newTokens.length} new tokens (total: ${subscribedTokens.size})`);
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
  toRemove.forEach(t => priceCache.delete(t));
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
  getCachedPrice,
  getAllCachedPrices,
  getStatus
};
