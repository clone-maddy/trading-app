const { connectAngelOne } = require('./angelone');

let monitorInterval = null;
let lockedPositions = new Set(); // Track locked positions
let partialExitDone = new Set(); // Track partial exits done

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

// Global settings and position settings storage
let globalSettings = null;
let positionSettings = {}; // { symbol: { target, stopLoss } }
let confirmationCount = {}; // For 2x confirmation before exit

const startPnLMonitor = async (settings) => {
  globalSettings = settings;
  lockedPositions.clear();
  partialExitDone.clear();
  confirmationCount = {};

  console.log(`PnL Monitor started!`);
  console.log(`Target Profit: ₹${settings.targetProfit}`);
  console.log(`Stop Loss: ₹${settings.stopLoss}`);

  monitorInterval = setInterval(async () => {
    try {
      // Check market hours
      if (!isMarketOpen()) {
        console.log('Market is closed. Monitor paused.');
        return;
      }

      const { smart } = await connectAngelOne();
      const response = await smart.getPosition();
      const positions = response.data || [];

      // Calculate total PnL (only unlocked positions)
      let totalPnL = 0;
      positions.forEach(pos => {
        if (!lockedPositions.has(pos.symbol)) {
          totalPnL += parseFloat(pos.pnl || 0);
        }
      });

      console.log(`Total PnL: ₹${totalPnL}`);

      // Step 1 — Check individual position limits FIRST
      for (const pos of positions) {
        // Skip locked positions
        if (lockedPositions.has(pos.symbol)) continue;

        // Skip if no individual settings for this position
        const posSetting = positionSettings[pos.symbol];
        if (!posSetting) continue;

        const pnl = parseFloat(pos.pnl || 0);
        const qty = parseInt(pos.quantity || 0);

        // Skip if position already closed
        if (qty === 0) {
          lockedPositions.add(pos.symbol);
          continue;
        }

        // Check individual stop loss
        if (posSetting.stopLoss && pnl <= posSetting.stopLoss) {
          confirmationCount[pos.symbol] = (confirmationCount[pos.symbol] || 0) + 1;
          if (confirmationCount[pos.symbol] >= 2) {
            console.log(`🔴 Individual Stop Loss hit for ${pos.symbol}! PnL: ₹${pnl}`);
            await exitPosition(smart, pos, 'full');
            lockedPositions.add(pos.symbol);
            confirmationCount[pos.symbol] = 0;
          } else {
            console.log(`⚠️ Stop loss warning 1/2 for ${pos.symbol}`);
          }
          continue;
        }

        // Check individual target profit
        if (posSetting.target && pnl >= posSetting.target) {
          confirmationCount[pos.symbol] = (confirmationCount[pos.symbol] || 0) + 1;
          if (confirmationCount[pos.symbol] >= 2) {
            console.log(`🟢 Individual Target hit for ${pos.symbol}! PnL: ₹${pnl}`);
            await exitPosition(smart, pos, 'full');
            lockedPositions.add(pos.symbol);
            confirmationCount[pos.symbol] = 0;
          } else {
            console.log(`⚠️ Target warning 1/2 for ${pos.symbol}`);
          }
          continue;
        }

        // Reset confirmation if back to normal
        confirmationCount[pos.symbol] = 0;
      }

      // Step 2 — Check total PnL limits (safety net)
      const activePositions = positions.filter(p => !lockedPositions.has(p.symbol) && parseInt(p.quantity) !== 0);

      // Check total stop loss
      if (globalSettings.stopLoss && totalPnL <= globalSettings.stopLoss) {
        console.log(`🔴 Total Stop Loss hit! PnL: ₹${totalPnL}. Exiting all...`);
        for (const pos of activePositions) {
          if (!lockedPositions.has(pos.symbol)) {
            await exitPosition(smart, pos, 'full');
            lockedPositions.add(pos.symbol);
          }
        }
        stopMonitor();
        return;
      }

      // Check total target profit
      if (globalSettings.targetProfit && totalPnL >= globalSettings.targetProfit) {
        console.log(`🟢 Total Target hit! PnL: ₹${totalPnL}. Exiting all...`);
        for (const pos of activePositions) {
          if (!lockedPositions.has(pos.symbol)) {
            await exitPosition(smart, pos, 'full');
            lockedPositions.add(pos.symbol);
          }
        }
        stopMonitor();
        return;
      }

      // Check partial profit
      if (globalSettings.partialProfitAt && totalPnL >= globalSettings.partialProfitAt) {
        for (const pos of activePositions) {
          if (!partialExitDone.has(pos.symbol) && !lockedPositions.has(pos.symbol)) {
            await exitPosition(smart, pos, 'partial', globalSettings.partialProfitPercent);
            partialExitDone.add(pos.symbol);
          }
        }
      }

    } catch (error) {
      console.log('Monitor error:', error.message);
    }
  }, 5000);
};

// Exit a position with retry logic
const exitPosition = async (smart, pos, type = 'full', percent = 100, retries = 3) => {
  const qty = parseInt(pos.quantity || 0);
  if (qty === 0) return;

  const exitQty = type === 'full' 
    ? Math.abs(qty) 
    : Math.floor(Math.abs(qty) * (percent / 100));

  if (exitQty === 0) return;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await smart.placeOrder({
        variety: 'NORMAL',
        tradingsymbol: pos.tradingsymbol || pos.symbol,
        symboltoken: pos.symboltoken,
        transactiontype: qty > 0 ? 'SELL' : 'BUY',
        exchange: 'NFO',
        ordertype: 'MARKET',
        producttype: 'INTRADAY',
        duration: 'DAY',
        quantity: exitQty
      });
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
const updatePositionSettings = (symbol, target, stopLoss) => {
  positionSettings[symbol] = { target, stopLoss };
  console.log(`Updated settings for ${symbol}: Target ₹${target}, Stop Loss ₹${stopLoss}`);
};

const stopMonitor = () => {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    lockedPositions.clear();
    partialExitDone.clear();
    confirmationCount = {};
    console.log('PnL Monitor stopped!');
  }
};

const isMonitoring = () => monitorInterval !== null;

module.exports = { 
  startPnLMonitor, 
  stopMonitor, 
  isMonitoring,
  updatePositionSettings
};