// src/aimodel/gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set in environment");
}

// Initialize with API key (standard Gemini API)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Get a Gemini model instance
 * @param {string} modelName - The model name WITHOUT "models/" prefix (e.g., "gemini-2.5-flash", "gemini-2.0-flash")
 * @returns {Object} - Gemini model instance
 */
function getGeminiModel(modelName = "gemini-2.5-flash") {
  return genAI.getGenerativeModel({ model: modelName });
}

module.exports = genAI;
module.exports.getGeminiModel = getGeminiModel;