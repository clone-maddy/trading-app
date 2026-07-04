const axios = require('axios');

async function callOpenRouter(messages) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const body = {
    model: 'openrouter/free',
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  };

  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
    },
    timeout: 10000
  });

  if (response.data && response.data.choices && response.data.choices[0]?.message?.content) {
    return {
      success: true,
      text: response.data.choices[0].message.content
    };
  }

  throw new Error('Invalid response structure from OpenRouter API');
}

module.exports = callOpenRouter;
