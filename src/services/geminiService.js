const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Generates content using Google GenAI SDK (New)
 * @param {Array} history - Chat history in format [{role: 'user'|'model', parts: [{text: string}]}]
 * @param {string} systemInstruction - System prompt
 * @returns {Promise<string>} Generated text
 */
async function generateContent(history, systemInstruction) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Separate the last message (current user input) from the history
    let chatHistory = [...history];
    let lastUserMessage = "";

    // Check if the last message is from user to send it via sendMessage
    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
        const lastMsgObj = chatHistory.pop();
        lastUserMessage = lastMsgObj.parts[0].text;
    }

    // Initialize chat with previous history
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      history: chatHistory,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    });

    const result = await chat.sendMessage({
        message: lastUserMessage
    });
    
    if (result && result.text) {
        return result.text;
    }
    
    return "Lo siento, no pude generar una respuesta.";

  } catch (error) {
    console.error('❌ Error calling Google GenAI SDK:', error);
    
    // Manejo de errores de cuota (429)
    if (error.message && (error.message.includes('429') || error.message.includes('quota'))) {
         return "Lo siento, el servicio de IA está saturado en este momento. Por favor intenta de nuevo en unos minutos.";
    }
    
    throw new Error('Error communicating with AI service: ' + error.message);
  }
}

module.exports = {
  generateContent
};
