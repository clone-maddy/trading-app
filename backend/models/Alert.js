const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'ema_crossover'
  },
  direction: {
    type: String,
    enum: ['bullish', 'bearish', 'above', 'below'],
    required: true
  },
  ema9Value: {
    type: Number
  },
  ema21Value: {
    type: Number
  },
  price: {
    type: Number
  },
  triggeredAt: {
    type: Date,
    default: Date.now
  },
  seen: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('Alert', AlertSchema);
