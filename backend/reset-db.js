const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const VirtualPortfolio = require('./models/VirtualPortfolio');
const VirtualTrade = require('./models/VirtualTrade');
const Alert = require('./models/Alert');
const AlertConfig = require('./models/AlertConfig');

dotenv.config();

const reset = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    // Clear collections
    console.log('Clearing old collections...');
    await User.deleteMany({});
    await VirtualPortfolio.deleteMany({});
    await VirtualTrade.deleteMany({});
    await Alert.deleteMany({});
    await AlertConfig.deleteMany({});
    console.log('Collections cleared.');

    // Load fallback credentials from credentials.txt if environment variables are not set
    let seedClientId = process.env.ANGEL_CLIENT_ID || '';
    let seedMpin = process.env.ANGEL_MPIN || '';
    let seedApiKey = process.env.ANGEL_API_KEY || '';
    let seedTotpSecret = process.env.ANGEL_TOTP_SECRET || '';
    let seedTelegram = '';

    const fs = require('fs');
    const path = require('path');
    const credPath = path.join(__dirname, '../credentials.txt');

    if (fs.existsSync(credPath)) {
      try {
        const text = fs.readFileSync(credPath, 'utf8');
        const getVal = (regex) => {
          const match = text.match(regex);
          return match ? match[1].trim() : '';
        };
        seedClientId = getVal(/Client ID:\s*(.*)/) || seedClientId;
        seedMpin = getVal(/MPIN:\s*(.*)/) || seedMpin;
        seedApiKey = getVal(/SmartAPI Key:\s*(.*)/) || seedApiKey;
        seedTotpSecret = getVal(/TOTP Secret Key:\s*(.*)/) || seedTotpSecret;
        seedTelegram = getVal(/Telegram Chat ID:\s*(.*)/) || seedTelegram;
        console.log('🔑 Loaded backup broker credentials from credentials.txt');
      } catch (e) {
        console.log('⚠️ Could not parse fallback credentials.txt file:', e.message);
      }
    }

    // Create fresh user pre-populated with parsed credentials
    console.log('Creating fresh user with broker details...');
    const user = new User({
      name: 'Chanakya Trader',
      email: 'user@chanakya.app',
      password: 'password123', // Schema pre-save hook will hash this
      angelClientId: seedClientId,
      angelMpin: seedMpin,
      angelApiKey: seedApiKey,
      angelTotpSecret: seedTotpSecret,
      telegramChatId: seedTelegram
    });

    await user.save();
    console.log('Fresh user created successfully!');
    console.log('------------------------------------');
    console.log('Email: user@chanakya.app');
    console.log('Password: password123');
    console.log('------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('Reset error:', err.message);
    process.exit(1);
  }
};

reset();
