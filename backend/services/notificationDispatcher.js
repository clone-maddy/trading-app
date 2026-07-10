const axios = require('axios');
const Alert = require('../models/Alert');
const User = require('../models/User');
const { getSymbolByToken } = require('./optionChain');

// Registry of Socket.IO notify callbacks
let socketNotifyCallback = null;

/**
 * Register a callback to emit Socket.IO alerts
 * @param {Function} callback - function(userId, alertDoc)
 */
const onAlert = (callback) => {
  socketNotifyCallback = callback;
};

/**
 * Send an EMA Crossover alert to a specific user
 * @param {string} userId - Target user ID
 * @param {Object} alertPayload - Crossover event payload { type, token, timestamp, ema9, ema21, ltp }
 */
const sendAlert = async (userId, alertPayload) => {
  try {
    // 1. Resolve trading symbol for the token
    const symbol = getSymbolByToken(alertPayload.token);

    // 2. Log alert in MongoDB
    const alert = new Alert({
      userId,
      token: alertPayload.token,
      symbol,
      type: 'ema_crossover',
      direction: alertPayload.type, // 'bullish' or 'bearish'
      ema9Value: alertPayload.ema9,
      ema21Value: alertPayload.ema21,
      triggeredAt: new Date(alertPayload.timestamp)
    });
    await alert.save();

    console.log(`💾 Saved Alert history log for User ${userId}: ${symbol} [${alertPayload.type.toUpperCase()}]`);

    // 3. Emit real-time Socket.IO notification to user room
    if (socketNotifyCallback) {
      socketNotifyCallback(userId, alert);
    }

    // 4. Send Telegram Bot Notification (if configured)
    const user = await User.findById(userId);
    if (user && user.telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
      const directionEmoji = alertPayload.type === 'bullish' ? '🟢 BULLISH' : '🔴 BEARISH';
      const crossWord = alertPayload.type === 'bullish' ? 'below' : 'above';
      
      const text = `🚨 <b>EMA CROSSOVER DETECTED</b>\n\n` +
                   `📈 <b>Contract:</b> <code>${symbol}</code>\n` +
                   `🔔 <b>Direction:</b> ${directionEmoji} (9 EMA cut 21 EMA from ${crossWord})\n` +
                   `💰 <b>Live LTP:</b> ₹${alertPayload.ltp.toFixed(2)}\n\n` +
                   `📊 <b>Indicator Values:</b>\n` +
                   `   • 9 EMA: ₹${alertPayload.ema9.toFixed(2)}\n` +
                   `   • 21 EMA: ₹${alertPayload.ema21.toFixed(2)}\n\n` +
                   `🕒 <b>Time:</b> ${new Date(alertPayload.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

      const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await axios.post(telegramUrl, {
        chat_id: user.telegramChatId,
        text,
        parse_mode: 'HTML'
      });
      console.log(`✈️ Dispatched Telegram notification to chat ${user.telegramChatId} for User ${userId}`);
    }

  } catch (error) {
    console.error(`❌ Failed to send alert:`, error.message);
  }
};

/**
 * Send a generic Telegram message to a specific user
 * @param {string} userId - Target user ID
 * @param {string} text - Message content (HTML formatted)
 */
const sendTelegramMessage = async (userId, text) => {
  try {
    const user = await User.findById(userId);
    if (user && user.telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
      const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await axios.post(telegramUrl, {
        chat_id: user.telegramChatId,
        text,
        parse_mode: 'HTML'
      });
      console.log(`✈️ Dispatched Telegram message to chat ${user.telegramChatId} for User ${userId}`);
    }
  } catch (error) {
    console.error(`❌ Failed to send Telegram message:`, error.message);
  }
};

module.exports = {
  sendAlert,
  onAlert,
  sendTelegramMessage
};
