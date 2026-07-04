const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { connectAngelOne } = require('./angelone');
const User = require('../models/User');

let scripMaster = null;

// Load scrip master file
const loadScripMaster = () => {
  if (scripMaster) return scripMaster;
  const filePath = path.join(__dirname, '..', 'scripmaster.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Scrip master file not found!');
  }
  scripMaster = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log('Scrip master loaded:', scripMaster.length, 'symbols');
  return scripMaster;
};

// Get all expiry dates for an index
const getExpiryDates = (indexName) => {
  const data = loadScripMaster();
  const expiries = [...new Set(
    data
      .filter(s => s.name === indexName && s.instrumenttype === 'OPTIDX')
      .map(s => s.expiry)
  )].sort();
  return expiries;
};

// Get option chain for index + expiry
const getOptionChain = async (indexName, expiry) => {
  const data = loadScripMaster();

  // Filter options for this index and expiry
  const options = data.filter(s =>
    s.name === indexName &&
    s.instrumenttype === 'OPTIDX' &&
    s.expiry === expiry
  );

  // Get unique strike prices
  const strikes = [...new Set(options.map(s => parseFloat(s.strike) / 100))]
    .sort((a, b) => a - b);

  // Get live prices from Angel One
  const tokens = options.map(s => s.token);
  
  let livePrices = {};
  try {
    const { authToken } = await connectAngelOne();
    
    // Fetch in batches of 50 (Angel One limit)
    const batchSize = 50;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const response = await axios.post(
        'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/',
        { mode: 'FULL', exchangeTokens: { 'NFO': batch } },
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '192.168.1.5',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': 'fe80::216e:6507:4b90:3719',
            'X-PrivateKey': process.env.ANGEL_API_KEY
          }
        }
      );
      
      if (response.data.status && response.data.data.fetched) {
        response.data.data.fetched.forEach(item => {
          livePrices[item.symbolToken] = {
            ltp: item.ltp || 0,
            oi: item.openInterest || 0,
            volume: item.tradeVolume || 0,
            bid: item.depth?.buy?.[0]?.price || 0,
            ask: item.depth?.sell?.[0]?.price || 0
          };
        });
      }
    }
  } catch (error) {
    console.log('Error fetching live prices:', error.message);
  }

  // Build option chain
  const chain = strikes.map(strike => {
    const ce = options.find(s => 
      parseFloat(s.strike) / 100 === strike && 
      s.symbol.endsWith('CE')
    );
    const pe = options.find(s => 
      parseFloat(s.strike) / 100 === strike && 
      s.symbol.endsWith('PE')
    );

    return {
      strike,
      ce: ce ? {
        token: ce.token,
        symbol: ce.symbol,
        ltp: livePrices[ce.token]?.ltp || 0,
        oi: livePrices[ce.token]?.oi || 0,
        volume: livePrices[ce.token]?.volume || 0,
        bid: livePrices[ce.token]?.bid || 0,
        ask: livePrices[ce.token]?.ask || 0,
        lotSize: parseInt(ce.lotsize)
      } : null,
      pe: pe ? {
        token: pe.token,
        symbol: pe.symbol,
        ltp: livePrices[pe.token]?.ltp || 0,
        oi: livePrices[pe.token]?.oi || 0,
        volume: livePrices[pe.token]?.volume || 0,
        bid: livePrices[pe.token]?.bid || 0,
        ask: livePrices[pe.token]?.ask || 0,
        lotSize: parseInt(pe.lotsize)
      } : null
    };
  });

  return chain;
};

// Get live price for a specific token
const getLivePrice = async (token, userId) => {
  try {
    const { authToken } = await connectAngelOne(userId);
    const user = await User.findById(userId);
    if (!user) return 0;

    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/',
      { mode: 'LTP', exchangeTokens: { 'NFO': [token] } },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '192.168.1.5',
          'X-ClientPublicIP': '106.193.147.98',
          'X-MACAddress': 'fe80::216e:6507:4b90:3719',
          'X-PrivateKey': user.angelApiKey
        }
      }
    );

    if (response.data.status && response.data.data.fetched.length > 0) {
      return response.data.data.fetched[0].ltp;
    }
    return 0;
  } catch (error) {
    console.log(`Error fetching live price for token ${token} (User ${userId}):`, error.message);
    return 0;
  }
};

// Get live spot price of index
const getIndexSpotPrice = async (indexName, userId) => {
  const tokenMap = {
    'NIFTY': '99926000',
    'BANKNIFTY': '99926009',
    'FINNIFTY': '99926037'
  };
  const token = tokenMap[indexName.toUpperCase()];
  if (!token) return 0;

  try {
    const { authToken } = await connectAngelOne(userId);
    const user = await User.findById(userId);
    if (!user) return 0;

    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/',
      { mode: 'LTP', exchangeTokens: { 'NSE': [token] } },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '192.168.1.5',
          'X-ClientPublicIP': '106.193.147.98',
          'X-MACAddress': 'fe80::216e:6507:4b90:3719',
          'X-PrivateKey': user.angelApiKey
        }
      }
    );

    if (response.data.status && response.data.data.fetched.length > 0) {
      return response.data.data.fetched[0].ltp;
    }
    return 0;
  } catch (error) {
    console.log(`Error fetching spot price for ${indexName} (User ${userId}):`, error.message);
    return 0;
  }
};

const formatDateForAngel = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

const getCandleData = async (symboltoken, exchange, interval, userId) => {
  try {
    const { authToken } = await connectAngelOne(userId);
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const now = new Date();
    const toDateStr = formatDateForAngel(now);
    
    let fromDate = new Date();
    if (interval === 'ONE_DAY') {
      fromDate.setDate(fromDate.getDate() - 90); // Last 90 days
    } else if (interval === 'ONE_HOUR') {
      fromDate.setDate(fromDate.getDate() - 15); // Last 15 days
    } else if (interval === 'FIFTEEN_MINUTE') {
      fromDate.setDate(fromDate.getDate() - 5);  // Last 5 days
    } else {
      fromDate.setDate(fromDate.getDate() - 2);  // Last 2 days (for 1m and 5m)
    }
    const fromDateStr = formatDateForAngel(fromDate);
    
    console.log(`[Historical API] Fetching ${interval} for token ${symboltoken} (${exchange}) from ${fromDateStr} to ${toDateStr} for user ${userId}`);

    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',
      {
        exchange,
        symboltoken,
        interval,
        fromdate: fromDateStr,
        todate: toDateStr
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '192.168.1.5',
          'X-ClientPublicIP': '106.193.147.98',
          'X-MACAddress': 'fe80::216e:6507:4b90:3719',
          'X-PrivateKey': user.angelApiKey
        }
      }
    );
    
    if (response.data && response.data.status) {
      return response.data.data;
    }
    throw new Error(response.data.message || 'Failed to fetch candle data');
  } catch (error) {
    console.log(`Error fetching candle data for user ${userId}:`, error.message);
    throw error;
  }
};

const getSymbolByToken = (token) => {
  try {
    const data = loadScripMaster();
    const match = data.find(s => s.token === token);
    return match ? match.symbol : token;
  } catch (err) {
    return token;
  }
};

module.exports = { getExpiryDates, getOptionChain, getLivePrice, getIndexSpotPrice, getCandleData, getSymbolByToken };