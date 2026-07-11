const nodemailer = require('nodemailer');
const User = require('../models/User');

const getTransporter = () => {
  const isConfigured = 
    process.env.SMTP_HOST && 
    process.env.SMTP_PORT && 
    process.env.SMTP_USER && 
    process.env.SMTP_PASS;

  if (!isConfigured) {
    console.log('⚠️ SMTP Credentials not configured in .env. Falling back to console logging emails.');
    return {
      sendMail: async (options) => {
        console.log(`✉️ [SMTP MOCK] Sending Email:`);
        console.log(`   To: ${options.to}`);
        console.log(`   Subject: ${options.subject}`);
        console.log(`   Body: ${options.text || '[HTML Body]'}`);
        return { messageId: 'mock-id-' + Date.now() };
      }
    };
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"Chanakya Trading" <${process.env.SMTP_USER || 'no-reply@chanakya.app'}>`,
      to: email,
      subject: '📈 Welcome to Chanakya Trading!',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px;">
            <h1 style="margin: 0; color: #2563eb; font-size: 24px; display: inline-flex; align-items: center; gap: 8px; vertical-align: middle;">
              <img src="${process.env.FRONTEND_URL || 'http://localhost:3001'}/logo-email.png" alt="Chanakya Logo" style="height: 32px; width: auto; vertical-align: middle; border: none;" onerror="this.style.display='none';" />
              <span style="vertical-align: middle; margin-left: 6px;">Chanakya</span>
            </h1>
            <p style="margin: 5px 0 0; color: #64748b; font-size: 14px;">Next-Generation Algo Trading Platform</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 15px;">Hello <b>${name}</b>,</p>
          
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">Welcome to Chanakya! Your trading account has been successfully created. We are excited to support you on your retail trading journey.</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px; color: #0f172a; font-size: 14px; text-transform: uppercase;">🚀 Core Capabilities</h3>
            <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #475569;">
              <li>📈 <b>Live Option Chains</b>: Trace Nifty/BankNifty prices and Put-Call Ratio (PCR).</li>
              <li>🚨 <b>Telegram Alerts</b>: Push EMA crossovers directly to your mobile phone.</li>
              <li>🛡️ <b>Automated Risk Control</b>: Set stop-loss and targets with auto square-off.</li>
              <li>🤖 <b>AI Trading Subagent</b>: Get indicators, scripts, and trading tips 24/7.</li>
            </ul>
          </div>
          
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">To connect your Telegram Bot and enable phone notifications, please head over to the <b>Account Settings</b> page inside your dashboard.</p>
          
          <div style="text-align: center; margin-bottom: 25px;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/account" style="display: inline-block; padding: 12px 30px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25); border: none;">
              ⚙️ Configure Account Settings
            </a>
          </div>
          
          <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 25px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.5;">
            <p style="margin: 0;">This is an automated system email from Chanakya Trading.</p>
            <p style="margin: 5px 0 0;">&copy; ${new Date().getFullYear()} Chanakya Trading Platform. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Welcome email successfully sent to ${email}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send welcome email to ${email}:`, error.message);
  }
};

const sendBroadcastEmail = async (subject, contentHtml) => {
  try {
    const transporter = getTransporter();
    const users = await User.find({ email: { $exists: true } });
    console.log(`✉️ Starting email broadcast to ${users.length} users...`);

    let successCount = 0;
    for (const user of users) {
      try {
        const mailOptions = {
          from: `"Chanakya Announcements" <${process.env.SMTP_USER || 'no-reply@chanakya.app'}>`,
          to: user.email,
          subject: subject,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
              <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px; text-align: center;">
                <h1 style="margin: 0; color: #2563eb; font-size: 20px; display: inline-flex; align-items: center; gap: 8px; vertical-align: middle;">
                  <img src="${process.env.FRONTEND_URL || 'http://localhost:3001'}/logo-email.png" alt="Chanakya Logo" style="height: 28px; width: auto; vertical-align: middle; border: none;" onerror="this.style.display='none';" />
                  <span style="vertical-align: middle; margin-left: 6px;">Chanakya Platform Alert</span>
                </h1>
              </div>
              
              <p style="font-size: 15px; line-height: 1.6; margin-bottom: 15px;">Hello <b>${user.name}</b>,</p>
              
              <div style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 25px;">
                ${contentHtml}
              </div>
              
              <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 25px; text-align: center; color: #94a3b8; font-size: 12px;">
                <p style="margin: 0;">You are receiving this platform announcement as a registered user of Chanakya.</p>
                <p style="margin: 5px 0 0;">&copy; ${new Date().getFullYear()} Chanakya Trading Platform.</p>
              </div>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to send broadcast email to ${user.email}:`, err.message);
      }
    }

    console.log(`✉️ Email broadcast completed. Dispatched successfully to ${successCount}/${users.length} users.`);
    return { success: true, count: successCount };
  } catch (error) {
    console.error('❌ Failed to run email broadcast:', error.message);
    throw error;
  }
};

const sendVerificationEmail = async (email, name, code) => {
  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"Chanakya Trading" <${process.env.SMTP_USER || 'no-reply@chanakya.app'}>`,
      to: email,
      subject: '🔑 Verify Your Chanakya Trading Account',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px;">
            <h1 style="margin: 0; color: #2563eb; font-size: 24px; display: inline-flex; align-items: center; gap: 8px; vertical-align: middle;">
              <img src="${process.env.FRONTEND_URL || 'http://localhost:3001'}/logo-email.png" alt="Chanakya Logo" style="height: 32px; width: auto; vertical-align: middle; border: none;" onerror="this.style.display='none';" />
              <span style="vertical-align: middle; margin-left: 6px;">Chanakya</span>
            </h1>
            <p style="margin: 5px 0 0; color: #64748b; font-size: 14px;">Email Verification Required</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 15px;">Hello <b>${name}</b>,</p>
          
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">Thank you for registering on Chanakya Algo Trading Platform. Please use the following 6-digit verification code to complete your signup and activate your account:</p>
          
          <div style="text-align: center; margin: 30px 0; padding: 15px; background-color: #f1f5f9; border-radius: 8px; border: 1px dashed #cbd5e1;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e293b;">${code}</span>
          </div>

          <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 25px;">This verification code is valid for 24 hours. If you did not sign up for a Chanakya account, you can safely ignore this email.</p>
          
          <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 25px; text-align: center; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">This is an automated system email from Chanakya Trading.</p>
            <p style="margin: 5px 0 0;">&copy; ${new Date().getFullYear()} Chanakya Trading Platform.</p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Verification email sent to ${email} with code ${code}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send verification email to ${email}:`, error.message);
  }
};

module.exports = { sendWelcomeEmail, sendBroadcastEmail, sendVerificationEmail };
