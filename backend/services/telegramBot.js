const axios = require('axios');
const User = require('../models/User');

let offset = 0;
let pollingInterval = null;

const startTelegramBot = async () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('⚠️ TELEGRAM_BOT_TOKEN not found in env. Telegram bot listener disabled.');
    return;
  }

  console.log('✈️ Initializing Telegram Bot update listener...');

  // Delete webhook on startup to prevent 409 conflict
  try {
    await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteWebhook`);
    console.log('✈️ Cleared any active Telegram Webhook configuration.');
  } catch (err) {
    console.log('⚠️ Telegram Webhook delete skipped:', err.message);
  }

  // Catch up to skip old messages on startup
  try {
    const catchupRes = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`, {
      params: { offset: -1, limit: 1 }
    });
    if (catchupRes.data?.ok && catchupRes.data?.result?.length > 0) {
      offset = catchupRes.data.result[0].update_id + 1;
      console.log(`✈️ Catchup successful. Starting bot offset at: ${offset}`);
    }
  } catch (err) {
    console.log('⚠️ Telegram Bot catchup skipped:', err.message);
  }

  // Poll for updates every 3 seconds
  pollingInterval = setInterval(async () => {
    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`,
        {
          params: {
            offset,
            timeout: 2,
            limit: 10
          }
        }
      );

      if (response.data?.ok && response.data?.result?.length > 0) {
        for (const update of response.data.result) {
          offset = update.update_id + 1;

          if (update.message && update.message.text) {
            const chat = update.message.chat;
            const text = update.message.text.trim();

            if (text.startsWith('/start')) {
              const parts = text.split(' ');
              const payload = parts[1]; // Get deep link parameter (userId)

              if (payload && payload.match(/^[0-9a-fA-F]{24}$/)) {
                const user = await User.findById(payload);
                if (user) {
                  user.telegramChatId = String(chat.id);
                  await user.save();
                  console.log(`✈️ Linked Telegram Chat ID ${chat.id} to User ${user.email}`);

                  // Send success verification message back to Telegram
                  const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
                  await axios.post(telegramUrl, {
                    chat_id: chat.id,
                    text: `🎉 <b>Welcome to Chanakya, ${user.name}!</b>\n\nYour account has been successfully linked! ✅\n\nYou will now receive your trading notifications and alerts directly here. 🚀`,
                    parse_mode: 'HTML'
                  });
                } else {
                  console.log(`⚠️ Telegram Link payload user not found: ${payload}`);
                }
              } else {
                // Standard start without payload
                const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
                await axios.post(telegramUrl, {
                  chat_id: chat.id,
                  text: `👋 <b>Welcome!</b>\n\nTo automatically link your Chanakya account to Telegram, please click the <b>Connect Bot</b> button inside your Chanakya Settings page.`,
                  parse_mode: 'HTML'
                });
              }
            }
          }
        }
      }
    } catch (error) {
      if (!error.message.includes('timeout') && !error.message.includes('ETIMEDOUT')) {
        console.error('❌ Telegram Bot updates polling error:', error.message);
      }
    }
  }, 3000);
};

module.exports = { startTelegramBot };
