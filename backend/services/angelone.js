const { SmartAPI } = require('smartapi-javascript');
const speakeasy = require('speakeasy');

let smartInstance = null;
let lastConnected = null;

const connectAngelOne = async () => {
  try {
    // Reuse existing connection if less than 30 mins old
    if (smartInstance && lastConnected && (Date.now() - lastConnected) < 30 * 60 * 1000) {
      return { smart: smartInstance };
    }

    const smart = new SmartAPI({
      api_key: process.env.ANGEL_API_KEY
    });

    const totp = speakeasy.totp({
      secret: process.env.ANGEL_TOTP_SECRET,
      encoding: 'base32'
    });

    const session = await smart.generateSession(
      process.env.ANGEL_CLIENT_ID,
      process.env.ANGEL_MPIN,
      totp
    );

    if (!session.status) {
      throw new Error(session.message || 'Angel One login failed');
    }

    smartInstance = smart;
    lastConnected = Date.now();
    console.log('Angel One connected successfully!');
    return { smart, session };

  } catch (error) {
    console.log('Angel One connection error:', error.message);
    throw error;
  }
};

module.exports = { connectAngelOne };