const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { 
  startPnLMonitor, 
  stopMonitor, 
  isMonitoring,
  updatePositionSettings,
  getMonitorSettings
} = require('../services/pnlMonitor');

// Protect all monitor routes with authentication middleware
router.use(authMiddleware);

// Start monitoring
router.post('/start', (req, res) => {
  const { targetProfit, stopLoss, partialProfitAt, partialProfitPercent, useTrailingSL, trailAmount, mode = 'real' } = req.body;

  if (!targetProfit || !stopLoss) {
    return res.json({
      success: false,
      message: 'Target profit and stop loss are required!'
    });
  }

  if (isMonitoring(mode)) {
    return res.json({
      success: false,
      message: `${mode.toUpperCase()} monitor is already running!`
    });
  }

  startPnLMonitor({ 
    targetProfit, 
    stopLoss, 
    partialProfitAt, 
    partialProfitPercent,
    useTrailingSL,
    trailAmount: Number(trailAmount || 0),
    mode,
    userId: req.userId
  });

  res.json({
    success: true,
    message: `Monitor started! Mode: ${mode.toUpperCase()}, Target: ₹${targetProfit}, Stop Loss: ₹${stopLoss}`
  });
});

// Stop monitoring
router.post('/stop', (req, res) => {
  const { mode = 'real' } = req.body;
  stopMonitor(mode);
  res.json({
    success: true,
    message: `${mode.toUpperCase()} monitor stopped!`
  });
});

// Check status
router.get('/status', (req, res) => {
  const { mode = 'real' } = req.query;
  res.json({
    success: true,
    isMonitoring: isMonitoring(mode),
    settings: getMonitorSettings(mode)
  });
});

// Update individual position settings
router.post('/position-settings', (req, res) => {
  const { symbol, target, stopLoss, useTrailingSL, trailAmount, mode = 'real' } = req.body;

  if (!symbol || !target || !stopLoss) {
    return res.json({
      success: false,
      message: 'Symbol, target and stopLoss are required!'
    });
  }

  updatePositionSettings(mode, symbol, Number(target), Number(stopLoss), !!useTrailingSL, Number(trailAmount || 1));

  res.json({
    success: true,
    message: `Settings updated for ${symbol} in ${mode.toUpperCase()} mode!`
  });
});

module.exports = router;