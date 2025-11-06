// src/aimodel/gemini.js
const { GoogleGenAI } = require("@google/genai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set in environment");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  vertexai: true,
  project: process.env.GCP_PROJECT_ID,
  location: process.env.GCP_LOCATION,
});

module.exports = ai;