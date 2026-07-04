const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getExpiryDates, getOptionChain, getIndexSpotPrice, getCandleData } = require('../services/optionChain');

// Get expiry dates for an index
router.get('/expiry/:index', authMiddleware, async (req, res) => {
  try {
    const { index } = req.params;
    const expiries = getExpiryDates(index.toUpperCase());
    res.json({ success: true, data: expiries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get option chain
router.get('/chain/:index/:expiry', authMiddleware, async (req, res) => {
  try {
    const { index, expiry } = req.params;
    const chain = await getOptionChain(index.toUpperCase(), expiry.toUpperCase());
    const spotPrice = await getIndexSpotPrice(index, req.userId);
    res.json({ success: true, data: chain, spotPrice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get historical candle data for charts
router.get('/candles', authMiddleware, async (req, res) => {
  try {
    const { token, exchange, interval } = req.query;
    if (!token || !exchange || !interval) {
      return res.status(400).json({ success: false, message: 'Missing required query parameters: token, exchange, interval' });
    }
    const candles = await getCandleData(token, exchange.toUpperCase(), interval.toUpperCase(), req.userId);
    res.json({ success: true, data: candles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;