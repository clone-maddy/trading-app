const { connectAngelOne } = require('./angelone');

let monitorInterval = null;

const startPnLMonitor = async (settings) => {
  const { targetProfit, stopLoss, partialProfitAt, partialProfitPercent } = settings;

  console.log(`PnL Monitor started!`);
  console.log(`Target Profit: ₹${targetProfit}`);
  console.log(`Stop Loss: ₹${stopLoss}`);

  monitorInterval = setInterval(async () => {
    try {
      const { smart } = await connectAngelOne();
      const positions = await smart.getPosition();

      // Calculate total PnL
      let totalPnL = 0;
      const data = positions.data || [];
      data.forEach(pos => {
        totalPnL += parseFloat(pos.pnl || 0);
      });

      console.log(`Current Total PnL: ₹${totalPnL}`);

      // Check Stop Loss
      if (totalPnL <= stopLoss) {
        console.log(`🔴 Stop Loss hit! PnL: ₹${totalPnL}. Exiting all positions...`);
        await exitAllPositions(smart, data);
        stopMonitor();
      }

      // Check Target Profit
      if (totalPnL >= targetProfit) {
        console.log(`🟢 Target Profit hit! PnL: ₹${totalPnL}. Exiting all positions...`);
        await exitAllPositions(smart, data);
        stopMonitor();
      }

      // Check Partial Profit
      if (partialProfitAt && totalPnL >= partialProfitAt) {
        console.log(`🟡 Partial Profit hit! PnL: ₹${totalPnL}. Exiting ${partialProfitPercent}% positions...`);
        await exitPartialPositions(smart, data, partialProfitPercent);
      }

    } catch (error) {
      console.log('PnL Monitor error:', error.message);
    }
  }, 5000); // Check every 5 seconds
};

const exitAllPositions = async (smart, positions) => {
  for (const pos of positions) {
    if (pos.quantity !== 0) {
      try {
        await smart.placeOrder({
          variety: 'NORMAL',
          tradingsymbol: pos.symbol,
          symboltoken: pos.symboltoken,
          transactiontype: pos.quantity > 0 ? 'SELL' : 'BUY',
          exchange: 'NFO',
          ordertype: 'MARKET',
          producttype: 'INTRADAY',
          duration: 'DAY',
          quantity: Math.abs(pos.quantity)
        });
        console.log(`Exited position: ${pos.symbol}`);
      } catch (error) {
        console.log(`Error exiting ${pos.symbol}:`, error.message);
      }
    }
  }
};

const exitPartialPositions = async (smart, positions, percent) => {
  for (const pos of positions) {
    if (pos.quantity !== 0) {
      const exitQuantity = Math.floor(Math.abs(pos.quantity) * (percent / 100));
      if (exitQuantity > 0) {
        try {
          await smart.placeOrder({
            variety: 'NORMAL',
            tradingsymbol: pos.symbol,
            symboltoken: pos.symboltoken,
            transactiontype: pos.quantity > 0 ? 'SELL' : 'BUY',
            exchange: 'NFO',
            ordertype: 'MARKET',
            producttype: 'INTRADAY',
            duration: 'DAY',
            quantity: exitQuantity
          });
          console.log(`Partial exit: ${pos.symbol} - ${exitQuantity} qty`);
        } catch (error) {
          console.log(`Error partial exit ${pos.symbol}:`, error.message);
        }
      }
    }
  }
};

const stopMonitor = () => {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('PnL Monitor stopped!');
  }
};

const isMonitoring = () => monitorInterval !== null;

module.exports = { startPnLMonitor, stopMonitor, isMonitoring };