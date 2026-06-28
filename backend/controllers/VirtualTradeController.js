const VirtualTrade = require('../models/VirtualTrade');
const VirtualPortfolio = require('../models/VirtualPortfolio');

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
      return res.json({
        success: false,
        message: 'Minimum balance is ₹10,000!'
      });
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
    const { symbol, quantity, buyPrice, type } = req.body;

    if (!symbol || !quantity || !buyPrice || !type) {
      return res.json({
        success: false,
        message: 'All fields are required!'
      });
    }

    const portfolio = await getOrCreatePortfolio(req.userId);
    const totalCost = buyPrice * quantity;

    // Check if enough balance
    if (totalCost > portfolio.balance) {
      return res.json({
        success: false,
        message: `Insufficient balance! Need ₹${totalCost}, Available ₹${portfolio.balance}`
      });
    }

    // Deduct balance
    portfolio.balance -= totalCost;
    portfolio.totalTrades += 1;
    await portfolio.save();

    // Create trade
    const trade = new VirtualTrade({
      userId: req.userId,
      symbol,
      quantity,
      buyPrice,
      currentPrice: buyPrice,
      type,
      status: 'OPEN',
      pnl: 0
    });
    await trade.save();

    res.json({
      success: true,
      message: `Virtual trade placed! Bought ${quantity} lots of ${symbol} at ₹${buyPrice}`,
      data: trade
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get open positions
const getOpenPositions = async (req, res) => {
  try {
    const positions = await VirtualTrade.find({
      userId: req.userId,
      status: 'OPEN'
    });
    res.json({ success: true, data: positions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Close a position
const closeTrade = async (req, res) => {
  try {
    const { tradeId, sellPrice } = req.body;

    const trade = await VirtualTrade.findOne({
      _id: tradeId,
      userId: req.userId,
      status: 'OPEN'
    });

    if (!trade) {
      return res.json({ success: false, message: 'Trade not found!' });
    }

    const pnl = (sellPrice - trade.buyPrice) * trade.quantity;
    trade.sellPrice = sellPrice;
    trade.pnl = pnl;
    trade.status = 'CLOSED';
    trade.closedAt = new Date();
    await trade.save();

    // Update portfolio
    const portfolio = await getOrCreatePortfolio(req.userId);
    portfolio.balance += (trade.buyPrice * trade.quantity) + pnl;
    portfolio.totalPnL += pnl;
    portfolio.todayPnL += pnl;
    if (pnl >= 0) {
      portfolio.winningTrades += 1;
    } else {
      portfolio.losingTrades += 1;
    }
    await portfolio.save();

    res.json({
      success: true,
      message: `Position closed! P&L: ₹${pnl.toFixed(2)}`,
      data: trade
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get trade history
const getTradeHistory = async (req, res) => {
  try {
    const trades = await VirtualTrade.find({
      userId: req.userId,
      status: 'CLOSED'
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

    // Close all open trades
    await VirtualTrade.updateMany(
      { userId: req.userId, status: 'OPEN' },
      { status: 'CLOSED', closedAt: new Date() }
    );

    // Reset portfolio
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
  resetPortfolio
};