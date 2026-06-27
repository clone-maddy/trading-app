const { connectAngelOne } = require('../services/angelone');

// Mock data for testing when no real positions exist
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

const getPositions = async (req, res) => {
  try {
    const { smart } = await connectAngelOne();
    const positions = await smart.getPosition();

    if (positions.status && positions.data && positions.data.length > 0) {
      res.json({
        success: true,
        data: positions.data
      });
    } else {
      // Return mock data for testing
      res.json({
        success: true,
        data: mockPositions,
        mock: true
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = { getPositions };