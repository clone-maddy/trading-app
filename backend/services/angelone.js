const axios = require('axios');
const speakeasy = require('speakeasy');
const User = require('../models/User');

// In-memory cache for user-specific AngelOne feed & API sessions
const activeSessions = {};

const connectAngelOne = async (userId) => {
  try {
    if (!userId) {
      throw new Error('UserId is required to connect to AngelOne');
    }

    // Retrieve user credentials from database
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User account not found!');
    }
    if (!user.angelClientId || !user.angelMpin || !user.angelTotpSecret || !user.angelApiKey) {
      throw new Error('AngelOne broker credentials are not configured. Please enter them in your Account settings page.');
    }

    const session = activeSessions[userId] || {};

    // Reuse existing connection if less than 30 mins old
    if (session.authToken && session.lastConnected && (Date.now() - session.lastConnected) < 30 * 60 * 1000) {
      return { authToken: session.authToken, feedToken: session.feedToken };
    }

    // Strip whitespaces if any in TOTP Secret
    const totpSecret = user.angelTotpSecret.replace(/\s+/g, '');
    const totp = speakeasy.totp({
      secret: totpSecret,
      encoding: 'base32'
    });

    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword',
      {
        clientcode: user.angelClientId,
        password: user.angelMpin,
        totp: totp
      },
      {
        headers: {
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

    if (!response.data.status) {
      throw new Error(response.data.message || 'Angel One login failed');
    }

    const newSession = {
      authToken: response.data.data.jwtToken,
      feedToken: response.data.data.feedToken,
      lastConnected: Date.now()
    };

    activeSessions[userId] = newSession;

    console.log(`Angel One connected successfully for user ${userId} (${user.email})!`);
    return { authToken: newSession.authToken, feedToken: newSession.feedToken };

  } catch (error) {
    console.log(`Angel One connection error for user ${userId}:`, error.message);
    throw error;
  }
};

const getPositions = async (userId) => {
  try {
    const tokens = await connectAngelOne(userId);
    const user = await User.findById(userId);

    const response = await axios.get(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getPosition',
      {
        headers: {
          'Authorization': `Bearer ${tokens.authToken}`,
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

    return response.data;

  } catch (error) {
    // Clear cached token on auth errors so next call re-authenticates
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.log(`Auth token expired/invalid for user ${userId}, clearing session cache for re-login`);
      delete activeSessions[userId];
    }
    console.log(`Get positions error for user ${userId}:`, error.message);
    throw error;
  }
};

const placeOrder = async (orderParams, userId) => {
  try {
    const tokens = await connectAngelOne(userId);
    const user = await User.findById(userId);

    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder',
      orderParams,
      {
        headers: {
          'Authorization': `Bearer ${tokens.authToken}`,
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

    return response.data;

  } catch (error) {
    console.log(`Place order error for user ${userId}:`, error.message);
    throw error;
  }
};

const getTradeBook = async (userId) => {
  try {
    const tokens = await connectAngelOne(userId);
    const user = await User.findById(userId);

    const response = await axios.get(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getTradeBook',
      {
        headers: {
          'Authorization': `Bearer ${tokens.authToken}`,
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

    return response.data;

  } catch (error) {
    console.log(`Get trade book error for user ${userId}:`, error.message);
    throw error;
  }
};

module.exports = { connectAngelOne, getPositions, placeOrder, getTradeBook };