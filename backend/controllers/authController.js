const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendWelcomeEmail, sendVerificationEmail } = require('../services/emailService');
const { encrypt, decrypt } = require('../utils/encryption');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Register
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({
        success: false,
        message: 'Email already registered!'
      });
    }

    // Create new user with verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const user = new User({ 
      name, 
      email, 
      password,
      isVerified: false,
      verificationCode
    });
    await user.save();

    // Trigger verification email asynchronously (non-blocking)
    sendVerificationEmail(user.email, user.name, verificationCode);

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Registration successful! Verification code sent to your email.',
      token,
      needsVerification: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: false
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        success: false,
        message: 'Invalid email or password!'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.json({
        success: false,
        message: 'Invalid email or password!'
      });
    }

    const token = generateToken(user._id);

    // If user is not verified, lock them out of core dashboard
    if (!user.isVerified) {
      return res.json({
        success: true,
        message: 'Account verification required.',
        token,
        needsVerification: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isVerified: false
        }
      });
    }

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: true
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

let cachedBotUsername = null;

// Get current user
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    let userObj = null;
    
    if (user) {
      userObj = user.toObject();
      // Mask credentials to prevent network exposure
      userObj.angelMpin = user.angelMpin ? '••••••••' : '';
      userObj.angelTotpSecret = user.angelTotpSecret ? '••••••••' : '';
    }
    
    // Resolve Telegram Bot username dynamically if not cached yet
    if (!cachedBotUsername && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const axios = require('axios');
        const response = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
        if (response.data?.ok && response.data?.result?.username) {
          cachedBotUsername = response.data.result.username;
        }
      } catch (err) {
        console.log('Error resolving Telegram Bot username:', err.message);
      }
    }

    res.json({
      success: true,
      user: userObj,
      telegramBotUsername: cachedBotUsername || 'ChanakyaTrading_bot'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user profile
const updateMe = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      angelApiKey,
      angelClientId,
      angelMpin,
      angelTotpSecret,
      telegramChatId,
      tradingMode
    } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found!' });
    }

    // Check if email already registered to someone else
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.json({ success: false, message: 'Email already registered!' });
      }
      user.email = email;
    }

    if (name) user.name = name;
    if (password) user.password = password; // mongoose schema pre-save hook will auto-hash it!
    
    // Update credentials (only overwrite if they are edited and not masked placeholders)
    if (angelApiKey !== undefined) user.angelApiKey = angelApiKey;
    if (angelClientId !== undefined) user.angelClientId = angelClientId;
    
    if (angelMpin !== undefined && angelMpin !== '••••••••') {
      user.angelMpin = angelMpin ? encrypt(angelMpin) : '';
    }
    if (angelTotpSecret !== undefined && angelTotpSecret !== '••••••••') {
      user.angelTotpSecret = angelTotpSecret ? encrypt(angelTotpSecret) : '';
    }
    
    if (telegramChatId !== undefined) user.telegramChatId = telegramChatId;
    if (tradingMode !== undefined) user.tradingMode = tradingMode;

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        tradingMode: user.tradingMode,
        telegramChatId: user.telegramChatId
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Verify Email Code
const verifyEmail = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.json({ success: false, message: 'Verification code is required!' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found!' });
    }

    if (user.isVerified) {
      return res.json({ success: true, message: 'Account is already verified!' });
    }

    if (user.verificationCode !== code) {
      return res.json({ success: false, message: 'Invalid verification code!' });
    }

    user.isVerified = true;
    user.verificationCode = ''; // Clear code
    await user.save();

    // Trigger welcome email asynchronously (non-blocking) now that they are verified
    sendWelcomeEmail(user.email, user.name);

    res.json({
      success: true,
      message: 'Email verified successfully! 🎉',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: true
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Resend Verification Code
const resendVerificationCode = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found!' });
    }

    if (user.isVerified) {
      return res.json({ success: false, message: 'Account is already verified!' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = verificationCode;
    await user.save();

    await sendVerificationEmail(user.email, user.name, verificationCode);

    res.json({
      success: true,
      message: 'New verification code sent to your email!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = { register, login, getMe, updateMe, verifyEmail, resendVerificationCode };