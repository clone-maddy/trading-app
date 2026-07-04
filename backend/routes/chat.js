const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const ChatMessage = require('../models/ChatMessage');
const { buildSystemPrompt } = require('../services/aiContextBuilder');
const { getAIResponse } = require('../services/aiAssistant');

// Get chat history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const messages = await ChatMessage.find({ userId: req.userId }).sort({ timestamp: 1 }).limit(50);
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Post a new message to AI assistant
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // 1. Save user message to database
    const userMessage = new ChatMessage({
      userId: req.userId,
      role: 'user',
      content: message
    });
    await userMessage.save();

    // 2. Fetch last 10 messages for short-term memory context
    const history = await ChatMessage.find({ userId: req.userId }).sort({ timestamp: -1 }).limit(10);
    // Reverse to chronological order (system -> oldest -> newest)
    const reversedHistory = history.reverse();

    // 3. Compile the user system prompt
    const systemPrompt = await buildSystemPrompt(req.userId);

    // 4. Structure message payload for AI assistant
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...reversedHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    // 5. Query fallback orchestrator
    const replyText = await getAIResponse(apiMessages);

    // 6. Save assistant response to database
    const assistantMessage = new ChatMessage({
      userId: req.userId,
      role: 'assistant',
      content: replyText
    });
    await assistantMessage.save();

    res.json({
      success: true,
      reply: replyText
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clear chat history
router.delete('/history', authMiddleware, async (req, res) => {
  try {
    await ChatMessage.deleteMany({ userId: req.userId });
    res.json({ success: true, message: 'Chat history cleared successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
