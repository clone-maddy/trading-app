const VirtualTrade = require('../models/VirtualTrade');
const VirtualPortfolio = require('../models/VirtualPortfolio');
const { getLivePrice } = require('../services/optionChain');

// Get or create portfolio
const getOrCreatePortfolio = async (userId) => {
  let portfolio = await VirtualPortfolio.findOne({ userId });
  if (!portfolio) {
    portfolio = new VirtualPortfolio({ userId });
    await portfolio.save();
  }
  return portfolio;
};

// Get portfolio
const getPortfolio = async (req, res) => {
  try {
    const portfolio = await getOrCreatePortfolio(req.userId);
    
    // Self-healing check: Sync metrics from closed trades database records
    const closedTrades = await VirtualTrade.find({
      userId: req.userId,
      status: 'CLOSED',
      closedAt: { $gte: portfolio.lastResetDate || new Date(0) }
    });

    let calculatedPnL = 0;
    let winning = 0;
    let losing = 0;

    closedTrades.forEach(t => {
      calculatedPnL += t.pnl;
      if (t.pnl >= 0) winning += 1;
      else losing += 1;
    });

    const calculatedTradesCount = closedTrades.length;

    if (
      portfolio.totalTrades !== calculatedTradesCount ||
      portfolio.winningTrades !== winning ||
      portfolio.losingTrades !== losing
    ) {
      portfolio.totalTrades = calculatedTradesCount;
      portfolio.winningTrades = winning;
      portfolio.losingTrades = losing;
      portfolio.totalPnL = calculatedPnL;
      await portfolio.save();
    }

    res.json({ success: true, data: portfolio });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Set initial balance
const setBalance = async (req, res) => {
  try {
    const { balance } = req.body;
    if (!balance || balance < 10000) {
      return res.json({ success: false, message: 'Minimum balance is ₹10,000!' });
    }
    const portfolio = await getOrCreatePortfolio(req.userId);
    portfolio.balance = balance;
    portfolio.initialBalance = balance;
    await portfolio.save();
    res.json({ success: true, message: 'Balance updated!', data: portfolio });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Place virtual trade
const placeTrade = async (req, res) => {
  try {
    const { symbol, quantity, buyPrice, type, side = 'BUY', token } = req.body;

    if (!symbol || !quantity || !buyPrice || !type) {
      return res.json({ success: false, message: 'All fields are required!' });
    }

    const portfolio = await getOrCreatePortfolio(req.userId);
    const totalCost = buyPrice * quantity;

    if (side === 'BUY') {
      // Buyer pays premium
      if (totalCost > portfolio.balance) {
        return res.json({
          success: false,
          message: `Insufficient balance! Need ₹${totalCost}, Available ₹${portfolio.balance}`
        });
      }
      portfolio.balance -= totalCost;
    } else {
      // Seller receives premium
      portfolio.balance += totalCost;
    }

    await portfolio.save();

    const trade = new VirtualTrade({
      userId: req.userId,
      symbol,
      quantity,
      buyPrice,
      currentPrice: buyPrice,
      type,
      side,
      token: token || null,
      status: 'OPEN',
      pnl: 0
    });
    await trade.save();

    const action = side === 'BUY' ? 'Bought' : 'Sold';
    res.json({
      success: true,
      message: `Virtual trade placed! ${action} ${quantity} qty of ${symbol} at ₹${buyPrice}`,
      data: trade
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get open positions with live prices
const getOpenPositions = async (req, res) => {
  try {
    const positions = await VirtualTrade.find({ userId: req.userId, status: 'OPEN' });

    // Fetch live prices for positions that have a token
    const updatedPositions = await Promise.all(
      positions.map(async (pos) => {
        const posObj = pos.toObject();

        if (pos.token) {
          try {
            const livePrice = await getLivePrice(pos.token);
            if (livePrice > 0) {
              posObj.currentPrice = livePrice;
              // BUY profits when price goes up, SELL profits when price goes down
              posObj.pnl = pos.side === 'SELL'
                ? (pos.buyPrice - livePrice) * pos.quantity
                : (livePrice - pos.buyPrice) * pos.quantity;
            }
          } catch (err) {
            // If live price fetch fails, keep stale values
            console.log(`Failed to get live price for ${pos.symbol}:`, err.message);
          }
        }

        return posObj;
      })
    );

    res.json({ success: true, data: updatedPositions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper to close a virtual position, shared with PnL monitor
const closeVirtualPosition = async (tradeId, userId, sellPrice, exitReason = 'MANUAL', exitSummary = null) => {
  const trade = await VirtualTrade.findOne({
    _id: tradeId,
    userId: userId,
    status: 'OPEN'
  });

  if (!trade) return null;

  const side = trade.side || 'BUY';
  const pnl = side === 'BUY'
    ? (sellPrice - trade.buyPrice) * trade.quantity
    : (trade.buyPrice - sellPrice) * trade.quantity;

  trade.sellPrice = sellPrice;
  trade.pnl = pnl;
  trade.status = 'CLOSED';
  trade.closedAt = new Date();
  trade.exitReason = exitReason;

  if (exitSummary) {
    trade.exitSummary = exitSummary;
  } else {
    const pnlStr = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
    switch (exitReason) {
      case 'TARGET_HIT':
        trade.exitSummary = `✅ Target reached at ₹${sellPrice} — Auto exited with P&L ${pnlStr}`;
        break;
      case 'STOPLOSS_HIT':
        trade.exitSummary = `🔴 Stop loss hit at ₹${sellPrice} — Auto exited with P&L ${pnlStr}`;
        break;
      case 'PARTIAL_EXIT':
        trade.exitSummary = `📊 Partial exit at ₹${sellPrice} — P&L ${pnlStr}`;
        break;
      default:
        trade.exitSummary = `👤 Manually exited at ₹${sellPrice} — P&L ${pnlStr}`;
    }
  }

  await trade.save();

  const portfolio = await getOrCreatePortfolio(userId);
  if (side === 'BUY') {
    portfolio.balance += (trade.buyPrice * trade.quantity) + pnl;
  } else {
    portfolio.balance -= sellPrice * trade.quantity;
  }

  portfolio.totalPnL += pnl;
  portfolio.todayPnL += pnl;
  portfolio.totalTrades += 1;
  if (pnl >= 0) {
    portfolio.winningTrades += 1;
  } else {
    portfolio.losingTrades += 1;
  }
  await portfolio.save();

  return trade;
};

// Close a position
const closeTrade = async (req, res) => {
  try {
    const { tradeId, sellPrice, exitReason, exitSummary } = req.body;
    const trade = await closeVirtualPosition(tradeId, req.userId, sellPrice, exitReason, exitSummary);

    if (!trade) {
      return res.json({ success: false, message: 'Trade not found!' });
    }

    res.json({
      success: true,
      message: `Position closed! P&L: ₹${trade.pnl.toFixed(2)}`,
      data: trade
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get trade history
const getTradeHistory = async (req, res) => {
  try {
    const portfolio = await getOrCreatePortfolio(req.userId);
    const trades = await VirtualTrade.find({
      userId: req.userId,
      status: 'CLOSED',
      closedAt: { $gte: portfolio.lastResetDate || new Date(0) }
    }).sort({ closedAt: -1 });
    res.json({ success: true, data: trades });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reset portfolio
const resetPortfolio = async (req, res) => {
  try {
    const portfolio = await getOrCreatePortfolio(req.userId);
    await VirtualTrade.updateMany(
      { userId: req.userId, status: 'OPEN' },
      { status: 'CLOSED', closedAt: new Date(), exitReason: 'MANUAL', exitSummary: '🔄 Portfolio reset — All positions closed' }
    );
    portfolio.balance = portfolio.initialBalance;
    portfolio.totalPnL = 0;
    portfolio.todayPnL = 0;
    portfolio.totalTrades = 0;
    portfolio.winningTrades = 0;
    portfolio.losingTrades = 0;
    portfolio.lastResetDate = new Date();
    await portfolio.save();
    res.json({ success: true, message: 'Portfolio reset successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPortfolio,
  setBalance,
  placeTrade,
  getOpenPositions,
  closeTrade,
  getTradeHistory,
  resetPortfolio,
  closeVirtualPosition
};