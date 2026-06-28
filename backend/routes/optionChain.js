const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getExpiryDates, getOptionChain } = require('../services/optionChain');

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
    res.json({ success: true, data: chain });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;