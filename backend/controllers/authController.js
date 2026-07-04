const User = require('../models/User');
const jwt = require('jsonwebtoken');

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

    // Create new user
    const user = new User({ name, email, password });
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Registration successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
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

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json({
      success: true,
      user
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
    
    // Update credentials
    if (angelApiKey !== undefined) user.angelApiKey = angelApiKey;
    if (angelClientId !== undefined) user.angelClientId = angelClientId;
    if (angelMpin !== undefined) user.angelMpin = angelMpin;
    if (angelTotpSecret !== undefined) user.angelTotpSecret = angelTotpSecret;
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

module.exports = { register, login, getMe, updateMe };