const express = require('express');
const router = express.Router();
const { startPnLMonitor, stopMonitor, isMonitoring } = require('../services/pnlMonitor');

// Start monitoring
router.post('/start', (req, res) => {
  const { targetProfit, stopLoss, partialProfitAt, partialProfitPercent } = req.body;

  if (!targetProfit || !stopLoss) {
    return res.json({
      success: false,
      message: 'Target profit and stop loss are required!'
    });
  }

  if (isMonitoring()) {
    return res.json({
      success: false,
      message: 'Monitor is already running!'
    });
  }

  startPnLMonitor({ targetProfit, stopLoss, partialProfitAt, partialProfitPercent });

  res.json({
    success: true,
    message: `Monitor started! Target: ₹${targetProfit}, Stop Loss: ₹${stopLoss}`
  });
});

// Stop monitoring
router.post('/stop', (req, res) => {
  stopMonitor();
  res.json({
    success: true,
    message: 'Monitor stopped!'
  });
});

// Check status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    isMonitoring: isMonitoring()
  });
});

module.exports = router;