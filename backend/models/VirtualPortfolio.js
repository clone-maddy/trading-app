const mongoose = require('mongoose');

const VirtualPortfolioSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 100000
  },
  initialBalance: {
    type: Number,
    default: 100000
  },
  totalPnL: {
    type: Number,
    default: 0
  },
  todayPnL: {
    type: Number,
    default: 0
  },
  totalTrades: {
    type: Number,
    default: 0
  },
  winningTrades: {
    type: Number,
    default: 0
  },
  losingTrades: {
    type: Number,
    default: 0
  },
  lastResetDate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('VirtualPortfolio', VirtualPortfolioSchema);