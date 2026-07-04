const callGemini = require('./aiProviders/gemini');
const callGroq = require('./aiProviders/groq');
const callOpenRouter = require('./aiProviders/openrouter');

async function getAIResponse(messages) {
  const providers = [
    { name: 'Gemini', fn: callGemini },
    { name: 'Groq', fn: callGroq },
    { name: 'OpenRouter', fn: callOpenRouter }
  ];

  for (const provider of providers) {
    try {
      console.log(`🤖 Chatbot: Attempting response with provider [${provider.name}]...`);
      const result = await provider.fn(messages);
      console.log(`✅ Chatbot: [${provider.name}] responded successfully!`);
      return result.text;
    } catch (err) {
      console.log(`⚠️ Chatbot: [${provider.name}] failed:`, err.message);
      continue;
    }
  }

  return "The trading assistant is currently busy or rate-limited. Please try again in a few moments.";
}

module.exports = { getAIResponse };
