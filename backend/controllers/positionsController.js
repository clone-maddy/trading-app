const { getPositions, placeOrder, getTradeBook } = require('../services/angelone');

const getPositionsController = async (req, res) => {
  try {
    const positions = await getPositions(req.userId);

    if (positions.status && positions.data && positions.data.length > 0) {
      const normalized = positions.data.map(pos => ({
        symbol: pos.tradingsymbol || pos.symbol,
        symboltoken: pos.symboltoken,
        quantity: parseInt(pos.netqty || pos.quantity || 0),
        buyPrice: parseFloat(pos.averageprice || pos.netprice || pos.buyPrice || 0),
        currentPrice: parseFloat(pos.ltp || pos.currentPrice || 0),
        pnl: parseFloat(pos.pnl || 0),
        producttype: pos.producttype,
        exchange: pos.exchange
      }));
      res.json({
        success: true,
        data: normalized
      });
    } else {
      res.json({
        success: true,
        data: []
      });
    }

  } catch (error) {
    res.json({
      success: true,
      data: []
    });
  }
};

const placeOrderController = async (req, res) => {
  try {
    const orderParams = req.body;
    const response = await placeOrder(orderParams, req.userId);
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getTradeHistoryController = async (req, res) => {
  try {
    const tradeBook = await getTradeBook(req.userId);
    if (tradeBook.status && tradeBook.data) {
      const normalized = tradeBook.data.map(trade => ({
        _id: trade.orderid,
        symbol: trade.tradingsymbol,
        quantity: parseInt(trade.fillqty || 0),
        buyPrice: parseFloat(trade.fillprice || 0),
        side: trade.transactiontype,
        createdAt: trade.filltime || new Date(),
        pnl: 0,
        exitSummary: `${trade.transactiontype} execution of ${trade.fillqty} qty at ₹${trade.fillprice} (${trade.producttype})`
      }));
      res.json({
        success: true,
        data: normalized
      });
    } else {
      res.json({
        success: true,
        data: []
      });
    }
  } catch (error) {
    res.json({
      success: true,
      data: []
    });
  }
};

module.exports = { 
  getPositions: getPositionsController,
  placeOrder: placeOrderController,
  getTradeHistory: getTradeHistoryController
};