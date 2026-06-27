const { SmartAPI } = require('smartapi-javascript');
const speakeasy = require('speakeasy');

const connectAngelOne = async () => {
  try {
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

    console.log('Angel One connected successfully!');
    return { smart, session };

  } catch (error) {
    console.log('Angel One connection error:', error);
  }
};

module.exports = { connectAngelOne };