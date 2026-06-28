const axios = require('axios');
const speakeasy = require('speakeasy');

let authToken = null;
let feedToken = null;
let lastConnected = null;

const connectAngelOne = async () => {
  try {
    // Reuse existing connection if less than 30 mins old
    if (authToken && lastConnected && (Date.now() - lastConnected) < 30 * 60 * 1000) {
      return { authToken, feedToken };
    }

    const totp = speakeasy.totp({
      secret: process.env.ANGEL_TOTP_SECRET,
      encoding: 'base32'
    });

    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword',
      {
        clientcode: process.env.ANGEL_CLIENT_ID,
        password: process.env.ANGEL_MPIN,
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
          'X-PrivateKey': process.env.ANGEL_API_KEY
        }
      }
    );

    if (!response.data.status) {
      throw new Error(response.data.message || 'Angel One login failed');
    }

    authToken = response.data.data.jwtToken;
    feedToken = response.data.data.feedToken;
    lastConnected = Date.now();

    console.log('Angel One connected successfully!');
    return { authToken, feedToken };

  } catch (error) {
    console.log('Angel One connection error:', error.message);
    throw error;
  }
};

const getPositions = async () => {
  try {
    const { authToken } = await connectAngelOne();

    const response = await axios.get(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getPosition',
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

    return response.data;

  } catch (error) {
    console.log('Get positions error:', error.message);
    throw error;
  }
};

const placeOrder = async (orderParams) => {
  try {
    const { authToken } = await connectAngelOne();

    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder',
      orderParams,
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

    return response.data;

  } catch (error) {
    console.log('Place order error:', error.message);
    throw error;
  }
};

module.exports = { connectAngelOne, getPositions, placeOrder };