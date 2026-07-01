const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getPositions, placeOrder, getTradeHistory } = require('../controllers/positionsController');

router.get('/', authMiddleware, getPositions);
router.post('/order', authMiddleware, placeOrder);
router.get('/history', authMiddleware, getTradeHistory);

module.exports = router;