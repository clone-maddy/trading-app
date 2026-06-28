const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { connectAngelOne } = require('./angelone');

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
        { mode: 'LTP', exchangeTokens: { 'NFO': batch } },
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
          livePrices[item.symbolToken] = item.ltp;
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
        ltp: livePrices[ce.token] || 0,
        lotSize: parseInt(ce.lotsize)
      } : null,
      pe: pe ? {
        token: pe.token,
        symbol: pe.symbol,
        ltp: livePrices[pe.token] || 0,
        lotSize: parseInt(pe.lotsize)
      } : null
    };
  });

  return chain;
};

// Get live price for a specific token
const getLivePrice = async (token) => {
  try {
    const { authToken } = await connectAngelOne();
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
          'X-PrivateKey': process.env.ANGEL_API_KEY
        }
      }
    );

    if (response.data.status && response.data.data.fetched.length > 0) {
      return response.data.data.fetched[0].ltp;
    }
    return 0;
  } catch (error) {
    console.log('Error fetching live price:', error.message);
    return 0;
  }
};

module.exports = { getExpiryDates, getOptionChain, getLivePrice };