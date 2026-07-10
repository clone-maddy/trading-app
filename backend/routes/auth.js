const express = require('express');
const router = express.Router();
const { register, login, getMe, updateMe, verifyEmail, resendVerificationCode } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const { sendBroadcastEmail } = require('../services/emailService');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, updateMe);
router.post('/verify-email', authMiddleware, verifyEmail);
router.post('/resend-verification', authMiddleware, resendVerificationCode);

// Send platform-wide email broadcast
router.post('/email-broadcast', authMiddleware, async (req, res) => {
  try {
    const { subject, body } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ success: false, message: 'Missing required parameters: subject, body' });
    }
    const result = await sendBroadcastEmail(subject, body);
    res.json({ success: true, message: `Broadcast successfully sent to ${result.count} users!` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;