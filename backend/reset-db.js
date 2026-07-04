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

    // Create fresh user pre-populated with .env credentials
    console.log('Creating fresh user with broker details...');
    const user = new User({
      name: 'Chanakya Trader',
      email: 'user@chanakya.app',
      password: 'password123', // Schema pre-save hook will hash this
      angelClientId: process.env.ANGEL_CLIENT_ID || '',
      angelMpin: process.env.ANGEL_MPIN || '',
      angelApiKey: process.env.ANGEL_API_KEY || '',
      angelTotpSecret: process.env.ANGEL_TOTP_SECRET || '',
      telegramChatId: ''
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
