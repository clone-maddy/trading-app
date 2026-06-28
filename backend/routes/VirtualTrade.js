const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getPortfolio,
  setBalance,
  placeTrade,
  getOpenPositions,
  closeTrade,
  getTradeHistory,
  resetPortfolio
} = require('../controllers/virtualTradeController');

// All routes protected by auth
router.use(authMiddleware);

router.get('/portfolio', getPortfolio);
router.post('/portfolio/balance', setBalance);
router.post('/trade', placeTrade);
router.get('/positions', getOpenPositions);
router.post('/close', closeTrade);
router.get('/history', getTradeHistory);
router.post('/reset', resetPortfolio);

module.exports = router;