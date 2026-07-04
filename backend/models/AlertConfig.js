const mongoose = require('mongoose');

const AlertConfigSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound unique index to prevent duplicate configurations for the same token per user
AlertConfigSchema.index({ userId: 1, token: 1 }, { unique: true });

module.exports = mongoose.model('AlertConfig', AlertConfigSchema);
