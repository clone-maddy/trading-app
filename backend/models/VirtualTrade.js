const mongoose = require('mongoose');

const VirtualTradeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  buyPrice: {
    type: Number,
    required: true
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  sellPrice: {
    type: Number,
    default: null
  },
  type: {
    type: String,
    enum: ['CE', 'PE'],
    required: true
  },
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    default: 'OPEN'
  },
  pnl: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('VirtualTrade', VirtualTradeSchema);