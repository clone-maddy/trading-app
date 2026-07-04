const { connectAngelOne, getPositions, placeOrder } = require('./angelone');
const VirtualTrade = require('../models/VirtualTrade');
const { closeVirtualPosition } = require('../controllers/VirtualTradeController');
const { getLivePrice } = require('./optionChain');
const { getCachedPrice } = require('./websocketFeed');

// Monitor update callback registry for Socket.IO
let monitorUpdateCallback = null;
const onMonitorUpdate = (callback) => {
  monitorUpdateCallback = callback;
};

// Monitor states for real and virtual modes
const monitorStates = {
  real: {
    interval: null,
    lockedPositions: new Set(),
    partialExitDone: new Set(),
    settings: null,
    positionSettings: {},
    confirmationCount: {},
    maxPnL: 0,
    dynamicStopLoss: null,
    lastTotalPnL: 0,
    positionMaxPnL: {},
    positionDynamicStopLoss: {}
  },
  virtual: {
    interval: null,
    lockedPositions: new Set(),
    partialExitDone: new Set(),
    settings: null,
    positionSettings: {},
    confirmationCount: {},
    maxPnL: 0,
    dynamicStopLoss: null,
    lastTotalPnL: 0,
    positionMaxPnL: {},
    positionDynamicStopLoss: {}
  }
};

// Check if market is open (9:15 AM - 3:30 PM IST)
const isMarketOpen = () => {
  const now = new Date();
  const IST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hours = IST.getHours();
  const minutes = IST.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 15;   // 9:15 AM
  const marketClose = 15 * 60 + 30; // 3:30 PM
  return totalMinutes >= marketOpen && totalMinutes <= marketClose;
};

const startPnLMonitor = async (settings) => {
  const mode = settings.mode || 'real';
  const state = monitorStates[mode];

  state.settings = settings;
  state.lockedPositions.clear();
  state.partialExitDone.clear();
  state.confirmationCount = {};
  state.maxPnL = 0;
  state.dynamicStopLoss = settings.stopLoss; // Initialize dynamic stop loss
  state.positionMaxPnL = {};
  state.positionDynamicStopLoss = {};

  console.log(`PnL Monitor started in [${mode.toUpperCase()}] mode!`);
  console.log(`Target Profit: ₹${settings.targetProfit}`);
  console.log(`Initial Stop Loss: ₹${settings.stopLoss}`);
  if (settings.useTrailingSL) {
    console.log(`Trailing Stop Loss: ENABLED`);
  }

  if (monitorUpdateCallback) {
    monitorUpdateCallback({
      mode,
      isMonitoring: true,
      settings: getMonitorSettings(mode)
    });
  }

  // Clear existing interval if running
  if (state.interval) {
    clearInterval(state.interval);
  }

  state.interval = setInterval(async () => {
    try {
      // Check market hours (Only in real mode)
      if (mode === 'real' && !isMarketOpen()) {
        console.log('Market is closed. Real monitor paused.');
        return;
      }

      let positions = [];

      if (mode === 'real') {
        const response = await getPositions(settings.userId);
        const rawPositions = response.data || [];

        // Normalize positions to consistent structure, preserving exchange and producttype
        positions = rawPositions.map(pos => ({
          symbol: pos.tradingsymbol || pos.symbol,
          symboltoken: pos.symboltoken,
          quantity: parseInt(pos.netqty || pos.quantity || 0),
          buyPrice: parseFloat(pos.averageprice || pos.netprice || pos.buyPrice || 0),
          currentPrice: parseFloat(pos.ltp || pos.currentPrice || 0),
          pnl: parseFloat(pos.pnl || 0),
          producttype: pos.producttype,
          exchange: pos.exchange
        }));
      } else {
        // Virtual Mode: Fetch open positions for this user
        const rawPositions = await VirtualTrade.find({ userId: settings.userId, status: 'OPEN' });

        positions = await Promise.all(
          rawPositions.map(async (pos) => {
            let currentPrice = pos.buyPrice;
            if (pos.token) {
              const cached = getCachedPrice(pos.token);
              if (cached) {
                currentPrice = cached;
              } else {
                const live = await getLivePrice(pos.token, settings.userId);
                if (live > 0) currentPrice = live;
              }
            }
            const pnl = pos.side === 'SELL'
              ? (pos.buyPrice - currentPrice) * pos.quantity
              : (currentPrice - pos.buyPrice) * pos.quantity;
            
            return {
              _id: pos._id,
              symbol: pos.symbol,
              symboltoken: pos.token,
              quantity: pos.quantity,
              buyPrice: pos.buyPrice,
              currentPrice,
              pnl,
              producttype: 'INTRADAY', // Default mock fields for virtual
              exchange: 'NFO'
            };
          })
        );
      }

      // Calculate total PnL (only unlocked positions)
      let totalPnL = 0;
      positions.forEach(pos => {
        if (!state.lockedPositions.has(pos.symbol)) {
          totalPnL += parseFloat(pos.pnl || 0);
        }
      });

      state.lastTotalPnL = totalPnL;
      console.log(`[${mode.toUpperCase()}] Total PnL: ₹${totalPnL.toFixed(2)}`);

      // Track Max PnL & Trail Stop Loss if enabled
      if (settings.useTrailingSL && totalPnL > 0) {
        const trailAmount = Number(settings.trailAmount || 1);
        if (totalPnL > state.maxPnL) {
          const diff = totalPnL - state.maxPnL;
          if (diff >= trailAmount) {
            const steps = Math.floor(diff / trailAmount);
            state.maxPnL += steps * trailAmount;
            state.dynamicStopLoss = (state.dynamicStopLoss || settings.stopLoss) + (steps * trailAmount);
            console.log(`[${mode.toUpperCase()}] Trailing Stop Loss trailed up. New Stop Loss: ₹${state.dynamicStopLoss.toFixed(2)} (Max P&L: ₹${state.maxPnL.toFixed(2)})`);
          } else {
            // P&L increased but not enough for a full step — just update maxPnL tracker
            state.maxPnL = Math.max(state.maxPnL, totalPnL);
          }
        }
      }

      // Step 1 — Check individual position limits FIRST
      for (const pos of positions) {
        // Skip locked positions
        if (state.lockedPositions.has(pos.symbol)) continue;

        // Skip if no individual settings for this position
        const posSetting = state.positionSettings[pos.symbol];
        if (!posSetting) continue;

        const pnl = parseFloat(pos.pnl || 0);
        const qty = parseInt(pos.quantity || 0);

        // Skip if position already closed
        if (qty === 0) {
          state.lockedPositions.add(pos.symbol);
          continue;
        }

        // Initialize position-specific trailing stop loss if enabled
        let currentPosStopLoss = posSetting.stopLoss;
        if (posSetting.useTrailingSL && pnl > 0) {
          const posTrailAmount = Number(posSetting.trailAmount || 1);
          if (!state.positionMaxPnL[pos.symbol]) {
            state.positionMaxPnL[pos.symbol] = pnl;
            state.positionDynamicStopLoss[pos.symbol] = posSetting.stopLoss;
          } else {
            const diff = pnl - state.positionMaxPnL[pos.symbol];
            if (diff >= posTrailAmount) {
              const steps = Math.floor(diff / posTrailAmount);
              state.positionMaxPnL[pos.symbol] += steps * posTrailAmount;
              state.positionDynamicStopLoss[pos.symbol] = (state.positionDynamicStopLoss[pos.symbol] || posSetting.stopLoss) + (steps * posTrailAmount);
              console.log(`[${mode.toUpperCase()}] Trailed Stop Loss for ${pos.symbol} to ₹${state.positionDynamicStopLoss[pos.symbol].toFixed(2)} (Max P&L: ₹${state.positionMaxPnL[pos.symbol].toFixed(2)})`);
            }
          }
          currentPosStopLoss = state.positionDynamicStopLoss[pos.symbol];
        }

        // Check individual stop loss
        if (currentPosStopLoss && pnl <= currentPosStopLoss) {
          state.confirmationCount[pos.symbol] = (state.confirmationCount[pos.symbol] || 0) + 1;
          if (state.confirmationCount[pos.symbol] >= 2) {
            console.log(`🔴 Individual Stop Loss hit for ${pos.symbol}! PnL: ₹${pnl}`);
            await exitPosition(pos, mode, 'full', 100, 3, 'STOPLOSS_HIT');
            state.lockedPositions.add(pos.symbol);
            state.confirmationCount[pos.symbol] = 0;
          } else {
            console.log(`⚠️ Stop loss warning 1/2 for ${pos.symbol}`);
          }
          continue;
        }

        // Check individual target profit
        if (posSetting.target && pnl >= posSetting.target) {
          state.confirmationCount[pos.symbol] = (state.confirmationCount[pos.symbol] || 0) + 1;
          if (state.confirmationCount[pos.symbol] >= 2) {
            console.log(`🟢 Individual Target hit for ${pos.symbol}! PnL: ₹${pnl}`);
            await exitPosition(pos, mode, 'full', 100, 3, 'TARGET_HIT');
            state.lockedPositions.add(pos.symbol);
            state.confirmationCount[pos.symbol] = 0;
          } else {
            console.log(`⚠️ Target warning 1/2 for ${pos.symbol}`);
          }
          continue;
        }

        // Reset confirmation if back to normal
        state.confirmationCount[pos.symbol] = 0;
      }

      // Step 2 — Check total PnL limits (safety net)
      const activePositions = positions.filter(p => !state.lockedPositions.has(p.symbol) && parseInt(p.quantity) !== 0);

      // Check total stop loss (using dynamicStopLoss which trails if enabled)
      const stopLossThreshold = settings.useTrailingSL ? state.dynamicStopLoss : settings.stopLoss;
      if (stopLossThreshold && totalPnL <= stopLossThreshold) {
        console.log(`🔴 Total Stop Loss hit! PnL: ₹${totalPnL}. Stop Loss Limit: ₹${stopLossThreshold}. Exiting all...`);
        for (const pos of activePositions) {
          if (!state.lockedPositions.has(pos.symbol)) {
            await exitPosition(pos, mode, 'full', 100, 3, 'STOPLOSS_HIT');
            state.lockedPositions.add(pos.symbol);
          }
        }
        stopMonitor(mode);
        return;
      }

      // Check total target profit
      if (settings.targetProfit && totalPnL >= settings.targetProfit) {
        console.log(`🟢 Total Target hit! PnL: ₹${totalPnL}. Exiting all...`);
        for (const pos of activePositions) {
          if (!state.lockedPositions.has(pos.symbol)) {
            await exitPosition(pos, mode, 'full', 100, 3, 'TARGET_HIT');
            state.lockedPositions.add(pos.symbol);
          }
        }
        stopMonitor(mode);
        return;
      }

      // Check partial profit
      if (settings.partialProfitAt && totalPnL >= settings.partialProfitAt) {
        for (const pos of activePositions) {
          if (!state.partialExitDone.has(pos.symbol) && !state.lockedPositions.has(pos.symbol)) {
            await exitPosition(pos, mode, 'partial', settings.partialProfitPercent, 3, 'PARTIAL_EXIT');
            state.partialExitDone.add(pos.symbol);
          }
        }
      }

      if (monitorUpdateCallback) {
        monitorUpdateCallback({
          mode,
          isMonitoring: true,
          settings: getMonitorSettings(mode)
        });
      }

    } catch (error) {
      console.log(`[${mode.toUpperCase()}] Monitor error:`, error.message);
    }
  }, 1000);
};

// Exit a position with retry logic
const exitPosition = async (pos, mode, type = 'full', percent = 100, retries = 3, reason = 'MANUAL') => {
  const state = monitorStates[mode];
  if (mode === 'virtual') {
    try {
      await closeVirtualPosition(pos._id, state.settings.userId, pos.currentPrice, reason);
      console.log(`✅ Virtual Position Auto-Exited: ${pos.symbol} at ₹${pos.currentPrice} [Reason: ${reason}]`);
      return;
    } catch (err) {
      console.log(`❌ Virtual auto-exit failed for ${pos.symbol}:`, err.message);
    }
    return;
  }

  // Real Mode
  const qty = parseInt(pos.quantity || 0);
  if (qty === 0) return;

  const exitQty = type === 'full' 
    ? Math.abs(qty) 
    : Math.floor(Math.abs(qty) * (percent / 100));

  if (exitQty === 0) return;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await placeOrder({
        variety: 'NORMAL',
        tradingsymbol: pos.symbol,
        symboltoken: pos.symboltoken,
        transactiontype: qty > 0 ? 'SELL' : 'BUY',
        exchange: pos.exchange || 'NFO',
        ordertype: 'MARKET',
        producttype: pos.producttype || 'INTRADAY',
        duration: 'DAY',
        quantity: exitQty
      }, state.settings.userId);
      console.log(`✅ Exited ${pos.symbol} - ${exitQty} qty (attempt ${attempt})`);
      return;
    } catch (error) {
      console.log(`❌ Exit attempt ${attempt} failed for ${pos.symbol}:`, error.message);
      if (attempt === retries) {
        console.log(`🚨 CRITICAL: Could not exit ${pos.symbol} after ${retries} attempts!`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
    }
  }
};

// Update position settings dynamically
const updatePositionSettings = (mode, symbol, target, stopLoss, useTrailingSL = false, trailAmount = 1) => {
  const state = monitorStates[mode];
  state.positionSettings[symbol] = { target, stopLoss, useTrailingSL, trailAmount };
  
  // Clear trailing stats on update
  if (state.positionMaxPnL[symbol]) {
    delete state.positionMaxPnL[symbol];
    delete state.positionDynamicStopLoss[symbol];
  }
  
  console.log(`[${mode.toUpperCase()}] Updated settings for ${symbol}: Target ₹${target}, Stop Loss ₹${stopLoss}, Trailing SL: ${useTrailingSL}, Trail Step: ${trailAmount}`);
};

const stopMonitor = (mode) => {
  const state = monitorStates[mode];
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
    state.lockedPositions.clear();
    state.partialExitDone.clear();
    state.confirmationCount = {};
    state.maxPnL = 0;
    state.dynamicStopLoss = null;
    state.lastTotalPnL = 0;
    state.positionMaxPnL = {};
    state.positionDynamicStopLoss = {};
    console.log(`PnL Monitor for [${mode.toUpperCase()}] stopped!`);

    if (monitorUpdateCallback) {
      monitorUpdateCallback({
        mode,
        isMonitoring: false,
        settings: null
      });
    }
  }
};

const isMonitoring = (mode) => {
  if (mode) {
    return monitorStates[mode].interval !== null;
  }
  return monitorStates.real.interval !== null || monitorStates.virtual.interval !== null;
};

const getMonitorSettings = (mode) => {
  const state = monitorStates[mode];
  if (!state.settings) return null;
  return {
    ...state.settings,
    // Live trailing data
    dynamicStopLoss: state.dynamicStopLoss,
    maxPnL: state.maxPnL || 0,
    totalPnL: state.lastTotalPnL || 0
  };
};

module.exports = { 
  startPnLMonitor, 
  stopMonitor, 
  isMonitoring,
  updatePositionSettings,
  getMonitorSettings,
  onMonitorUpdate
};