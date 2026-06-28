const { getPositions } = require('../services/angelone');

const mockPositions = [
  {
    symbol: "NIFTY2460722000CE",
    quantity: 50,
    buyPrice: 150,
    currentPrice: 175,
    pnl: 1250
  },
  {
    symbol: "BANKNIFTY2460745000PE",
    quantity: 25,
    buyPrice: 200,
    currentPrice: 180,
    pnl: -500
  }
];

const getPositionsController = async (req, res) => {
  try {
    const positions = await getPositions();

    if (positions.status && positions.data && positions.data.length > 0) {
      res.json({
        success: true,
        data: positions.data
      });
    } else {
      res.json({
        success: true,
        data: mockPositions,
        mock: true
      });
    }

  } catch (error) {
    // If API fails, return mock data
    res.json({
      success: true,
      data: mockPositions,
      mock: true
    });
  }
};

module.exports = { getPositions: getPositionsController };