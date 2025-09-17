require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// Gemini and Veo-3 API integration service
const axios = require('axios');
const GEMINI_API_KEY_VEO = process.env.GEMINI_API_KEY_VEO;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in environment');

const VEO3_API_KEY = process.env.VEO3_API_KEY;
if (!VEO3_API_KEY) throw new Error('VEO3_API_KEY not set in environment');

const GEMINI_MODEL = 'models/gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent`;
const VEO3_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/veo-3:generateVideo';

const GEMINI_LIST_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * List available Gemini models for the API key.
 * Logs the available models and returns the list.
 */
async function listModels(apiKey = GEMINI_API_KEY) {
  try {
    const response = await axios.get(
      `${GEMINI_LIST_MODELS_URL}?key=${apiKey}`
    );
    const models = response.data.models || [];
    console.log(`Available models for key ${apiKey === GEMINI_API_KEY ? 'GEMINI_API_KEY' : 'VEO3_API_KEY'}:`, models.map(m => m.name));
    return models;
  } catch (err) {
    console.error('Error fetching models:', err.response?.data?.error?.message || err.message);
    throw new Error('Failed to list models');
  }
}

async function generateScript(prompt) {
  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      }
    );
    // Gemini returns candidates[0].content.parts[0].text
    const script = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!script) throw new Error('No script returned from Gemini');
    return script;
  } catch (err) {
    let apiMsg = err.response?.data?.error?.message || err.message;
    if (err.response?.status === 404) {
      apiMsg += ` (Model "${GEMINI_MODEL}" may not be supported for your API key)`;
    }
    throw new Error('Gemini API error: ' + apiMsg);
  }
}

async function generateVideo(script, videoConfig) {
  try {
    const response = await axios.post(
      `${VEO3_API_URL}?key=${VEO3_API_KEY}`,
      {
        contents: [{ parts: [{ text: script }] }],
        ...(videoConfig ? { videoConfig } : {})
      }
    );
    // Veo-3 returns video in base64 or as a URL (assume base64 for this example)
    const videoBase64 = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!videoBase64) throw new Error('No video returned from Veo-3');
    return videoBase64;
  } catch (err) {
    // Log the error and status for diagnosis
    // Log the full Gemini error response for debugging
    if (err.response) {
      console.error('Veo-3 API error FULL RESPONSE:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Veo-3 API error (no response):', err.message);
    }

    if (err.response?.status === 404) {
      // Veo-3 endpoint not available for this API key
      // Optionally, return a mock video URL for demo/testing
      const mockVideoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4'; // public demo video
      // Return a special object to indicate mock/demo mode
      return {
        mock: true,
        message: 'Veo-3 video generation is not available for your API key. Returning a mock video for demo/testing.',
        videoUrl: mockVideoUrl
      };
    }

    throw new Error('Veo-3 API error: ' + (err.response?.data?.error?.message || err.message));
  }
}

module.exports = { generateScript, generateVideo, listModels };
// TEMP: Log available Gemini models at startup for debugging
if (require.main === module) {
  // List models for both keys
  listModels(GEMINI_API_KEY).catch(err => console.error('ListModels error (GEMINI_API_KEY):', err.message));
  listModels(VEO3_API_KEY).catch(err => console.error('ListModels error (VEO3_API_KEY):', err.message));
}