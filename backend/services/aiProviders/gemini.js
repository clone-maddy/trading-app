const axios = require('axios');

async function callGemini(messages) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const systemMsg = messages.find(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');

  const contents = otherMsgs.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const body = { contents };

  if (systemMsg) {
    body.systemInstruction = {
      parts: [{ text: systemMsg.content }]
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  });

  if (response.data && response.data.candidates && response.data.candidates[0]?.content?.parts?.[0]?.text) {
    return {
      success: true,
      text: response.data.candidates[0].content.parts[0].text
    };
  }

  throw new Error('Invalid response structure from Gemini API');
}

module.exports = callGemini;
