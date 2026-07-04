const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const AlertConfig = require('../models/AlertConfig');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { subscribeTokens, unsubscribeTokens } = require('../services/websocketFeed');
const { getSymbolByToken } = require('../services/optionChain');

// GET /api/alerts - retrieve triggered alerts, sorted newest first
router.get('/', authMiddleware, async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.userId }).sort({ triggeredAt: -1 });
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/alerts/unseen - get count of unseen alerts
router.get('/unseen', authMiddleware, async (req, res) => {
  try {
    const count = await Alert.countDocuments({ userId: req.userId, seen: false });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/alerts/:id/seen - mark a single alert as seen
router.patch('/:id/seen', authMiddleware, async (req, res) => {
  try {
    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { seen: true },
      { new: true }
    );
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found!' });
    }
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/alerts/seen-all - mark all user alerts as seen
router.patch('/seen-all', authMiddleware, async (req, res) => {
  try {
    await Alert.updateMany({ userId: req.userId, seen: false }, { seen: true });
    res.json({ success: true, message: 'All alerts marked as seen!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/alerts/:id - delete a single alert history log
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const alert = await Alert.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found!' });
    }
    res.json({ success: true, message: 'Alert deleted successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/alerts/config - get user's active alert configurations
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const configs = await AlertConfig.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/alerts/config - create new stock alert configuration
router.post('/config', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Missing token parameter!' });
    }

    // Resolve trading symbol
    const symbol = getSymbolByToken(token);

    // Check if configuration already exists
    let config = await AlertConfig.findOne({ userId: req.userId, token });
    if (config) {
      return res.json({ success: false, message: 'Stock is already being monitored!' });
    }

    config = new AlertConfig({
      userId: req.userId,
      token,
      symbol
    });
    await config.save();

    // Trigger backend websocket subscription dynamically
    await subscribeTokens([token]);

    res.json({
      success: true,
      message: `Successfully set up EMA Crossover monitor for ${symbol}!`,
      data: config
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/alerts/config/:token - remove active configuration
router.delete('/config/:token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.params;
    const config = await AlertConfig.findOneAndDelete({ userId: req.userId, token });
    if (!config) {
      return res.status(404).json({ success: false, message: 'Monitor configuration not found!' });
    }

    // Trigger unsubscribe dynamically (Websocket check ref counts and unsub if no other listeners)
    await unsubscribeTokens([token]);

    res.json({ success: true, message: `Stopped monitoring ${config.symbol}!` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/alerts/telegram-chat-id - set / update user's telegram chat ID
router.post('/telegram-chat-id', authMiddleware, async (req, res) => {
  try {
    const { telegramChatId } = req.body;
    
    // Save to user model
    const user = await User.findByIdAndUpdate(
      req.userId,
      { telegramChatId: telegramChatId || '' },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found!' });
    }

    res.json({
      success: true,
      message: telegramChatId ? 'Telegram Chat ID saved successfully!' : 'Telegram Chat ID removed successfully!',
      telegramChatId: user.telegramChatId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
