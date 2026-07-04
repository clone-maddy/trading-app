const axios = require('axios');

async function callGroq(messages) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const body = {
    model: 'llama-3.1-8b-instant',
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  };

  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    timeout: 10000
  });

  if (response.data && response.data.choices && response.data.choices[0]?.message?.content) {
    return {
      success: true,
      text: response.data.choices[0].message.content
    };
  }

  throw new Error('Invalid response structure from Groq API');
}

module.exports = callGroq;
