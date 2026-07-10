const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { connectAngelOne } = require('./angelone');
const User = require('../models/User');

let scripMaster = null;

// Automatically download fresh scrip master if older than 24 hours on load
const checkAndDownloadScripMaster = async () => {
  const filePath = path.join(__dirname, '..', 'scripmaster.json');
  const tempPath = filePath + '.tmp';
  let needsDownload = false;
  if (!fs.existsSync(filePath)) {
    needsDownload = true;
  } else {
    try {
      const stats = fs.statSync(filePath);
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) {
        needsDownload = true;
      }
    } catch (e) {
      needsDownload = true;
    }
  }

  if (needsDownload) {
    console.log('🔄 Scrip master is missing or older than 24 hours. Fetching fresh copy from AngelOne...');
    try {
      const url = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);
        writer.on('finish', () => {
          try {
            fs.renameSync(tempPath, filePath);
            console.log('✅ Fresh scrip master downloaded and replaced atomically!');
            scripMaster = null; // Clear cache
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        writer.on('error', (err) => {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
          reject(err);
        });
      });
    } catch (err) {
      console.log('⚠️ Failed to download fresh scrip master:', err.message);
    }
  }
};

// Trigger download check immediately on load
checkAndDownloadScripMaster().catch(err => console.log('Scrip master boot check failed:', err.message));

// Load scrip master file
const loadScripMaster = () => {
  if (scripMaster) return scripMaster;
  const filePath = path.join(__dirname, '..', 'scripmaster.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Scrip master file not found and download failed!');
  }
  scripMaster = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log('Scrip master loaded:', scripMaster.length, 'symbols');
  return scripMaster;
};

// Helper to parse DDMMMYYYY (e.g. 07JUL2026) into Date object for chronological sorting
const parseExpiryDate = (expiryStr) => {
  if (!expiryStr) return new Date(0);
  const months = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
  };
  const day = parseInt(expiryStr.substring(0, 2), 10);
  const monthStr = expiryStr.substring(2, 5).toUpperCase();
  const year = parseInt(expiryStr.substring(5), 10);
  const month = months[monthStr] !== undefined ? months[monthStr] : 0;
  return new Date(year, month, day);
};

// Get all expiry dates for an index
const getExpiryDates = (indexName) => {
  const data = loadScripMaster();
  const expiries = [...new Set(
    data
      .filter(s => s.name === indexName && s.instrumenttype === 'OPTIDX')
      .map(s => s.expiry)
  )];
  
  // Sort chronologically ascending
  expiries.sort((a, b) => parseExpiryDate(a) - parseExpiryDate(b));
  
  return expiries;
};

// Get option chain for index + expiry
const getOptionChain = async (indexName, expiry, userId) => {
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
    const { authToken } = await connectAngelOne(userId);
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
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
            'X-PrivateKey': process.env.ANGEL_API_KEY || user.angelApiKey
          }
        }
      );
      
      if (response.data.status && response.data.data.fetched) {
        response.data.data.fetched.forEach(item => {
          livePrices[item.symbolToken] = {
            ltp: item.ltp || 0,
            oi: item.opnInterest || 0,
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
          'X-PrivateKey': process.env.ANGEL_API_KEY || user.angelApiKey
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
          'X-PrivateKey': process.env.ANGEL_API_KEY || user.angelApiKey
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
      fromDate.setDate(fromDate.getDate() - 180); // Last 180 days
    } else if (interval === 'ONE_HOUR') {
      fromDate.setDate(fromDate.getDate() - 30);  // Last 30 days
    } else if (interval === 'FIFTEEN_MINUTE') {
      fromDate.setDate(fromDate.getDate() - 15);  // Last 15 days
    } else if (interval === 'FIVE_MINUTE') {
      fromDate.setDate(fromDate.getDate() - 15);  // Last 15 days
    } else {
      fromDate.setDate(fromDate.getDate() - 10);  // Last 10 days (for 1m)
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
          'X-PrivateKey': process.env.ANGEL_API_KEY || user.angelApiKey
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

const getMultiExpiryOiSummary = async (indexName, userId) => {
  const scripData = loadScripMaster();
  const spotPrice = await getIndexSpotPrice(indexName, userId);
  if (!spotPrice) {
    throw new Error('Could not fetch spot price for ' + indexName);
  }

  // Get all expiry dates sorted chronologically
  const expiries = getExpiryDates(indexName);
  // Limit to near-term expiries (e.g. first 5 expiries) to avoid hitting limits
  const targetExpiries = expiries.slice(0, 5);

  const summary = [];
  const { authToken } = await connectAngelOne(userId);
  const user = await User.findById(userId);

  for (const expiry of targetExpiries) {
    const optionsForExpiry = scripData.filter(
      s => s.name === indexName && s.expiry === expiry && s.instrumenttype === 'OPTIDX'
    );

    if (optionsForExpiry.length === 0) continue;

    // We can group option contracts by strike
    const strikes = [...new Set(optionsForExpiry.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
    if (strikes.length === 0) continue;

    const closestStrike = strikes.reduce((prev, curr) => {
      return Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev;
    });

    const atmIdx = strikes.indexOf(closestStrike);
    const startIdx = Math.max(0, atmIdx - 3);
    const endIdx = Math.min(strikes.length - 1, atmIdx + 3);
    const targetStrikes = strikes.slice(startIdx, endIdx + 1);

    const targetTokens = optionsForExpiry.filter(
      o => targetStrikes.includes(parseFloat(o.strike) / 100)
    );

    const tokensToFetch = targetTokens.map(o => o.token);

    let ceOiSum = 0;
    let peOiSum = 0;

    const batchSize = 50;
    for (let i = 0; i < tokensToFetch.length; i += batchSize) {
      const batch = tokensToFetch.slice(i, i + batchSize);
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
            'X-PrivateKey': process.env.ANGEL_API_KEY || user.angelApiKey
          }
        }
      );

      if (response.data.status && response.data.data.fetched) {
        response.data.data.fetched.forEach(item => {
          const tokenDetails = targetTokens.find(t => t.token === item.symbolToken);
          if (tokenDetails) {
            const oi = parseInt(item.opnInterest || 0);
            if (tokenDetails.symbol.endsWith('CE')) {
              ceOiSum += oi;
            } else if (tokenDetails.symbol.endsWith('PE')) {
              peOiSum += oi;
            }
          }
        });
      }
    }

    const pcr = ceOiSum > 0 ? Number((peOiSum / ceOiSum).toFixed(2)) : 0;
    summary.push({
      expiry,
      ceOi: ceOiSum,
      peOi: peOiSum,
      pcr
    });
  }

  return { summary, spotPrice };
};

module.exports = { getExpiryDates, getOptionChain, getLivePrice, getIndexSpotPrice, getCandleData, getSymbolByToken, getMultiExpiryOiSummary };