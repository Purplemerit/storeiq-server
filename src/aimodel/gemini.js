// src/aimodel/gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set in environment");
}

// Initialize with API key (standard Gemini API)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Get a Gemini model instance
 * @param {string} modelName - The model name with "models/" prefix (e.g., "models/gemini-2.0-flash-exp", "models/gemini-1.5-pro")
 * @returns {Object} - Gemini model instance
 */
function getGeminiModel(modelName = "models/gemini-2.0-flash-exp") {
  return genAI.getGenerativeModel({ model: modelName });
}

module.exports = genAI;
module.exports.getGeminiModel = getGeminiModel;