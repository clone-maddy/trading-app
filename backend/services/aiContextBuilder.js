const { getPositions } = require('./angelone');
const VirtualPortfolio = require('../models/VirtualPortfolio');
const VirtualTrade = require('../models/VirtualTrade');
const appKnowledge = require('../data/appKnowledge');

async function buildSystemPrompt(userId) {
  let realPositions = [];
  let virtualPositions = [];
  let virtualBalance = 0;

  // 1. Fetch Real Positions
  try {
    const response = await getPositions(userId);
    if (response && response.status && response.data) {
      realPositions = response.data.map(p => ({
        symbol: p.tradingsymbol || p.symbol,
        quantity: parseInt(p.netqty || p.quantity || 0),
        buyPrice: parseFloat(p.averageprice || p.netprice || p.buyPrice || 0),
        pnl: parseFloat(p.pnl || 0)
      }));
    } else {
      realPositions = [];
    }
  } catch (err) {
    realPositions = "Unavailable (AngelOne broker credentials not connected or session expired)";
  }

  // 2. Fetch Virtual Positions & Balance
  try {
    const portfolio = await VirtualPortfolio.findOne({ userId });
    if (portfolio) {
      virtualBalance = portfolio.balance;
    }
    const rawVirtual = await VirtualTrade.find({ userId, status: 'OPEN' });
    virtualPositions = rawVirtual.map(p => ({
      symbol: p.symbol,
      side: p.side,
      quantity: p.quantity,
      buyPrice: p.buyPrice
    }));
  } catch (err) {
    console.log('Error loading virtual states for chatbot:', err.message);
  }

  return `You are "Chanakya Assistant", an intelligent options trading companion chatbot for the Chanakya Platform.

Live User Context:
-----------------
Active Real Positions (AngelOne): ${JSON.stringify(realPositions)}
Active Virtual Paper Positions: ${JSON.stringify(virtualPositions)}
Virtual Portfolio Practice Balance: ₹${Number(virtualBalance).toLocaleString('en-IN')}

App Knowledge Base:
------------------
${appKnowledge}

Instructions:
-------------
- Answer options trading support and feature questions concisely.
- Reference the user's actual open positions and balance above if they ask about their portfolio, current trades, or P&L.
- Keep answers friendly, professional, clear, and direct. Avoid generic filler.
- Keep responses tailored to Indian derivatives trading (NIFTY/BANKNIFTY/FINNIFTY).
- DO NOT list raw JSON arrays in your text. Format positions in clean bullet points if asked.
`;
}

module.exports = { buildSystemPrompt };
