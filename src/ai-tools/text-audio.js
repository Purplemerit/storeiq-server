// server/src/ai-tools/text-audio.js
//
// Text-to-Speech using Google Cloud Text-to-Speech API (Vertex AI)
// Uses Neural2 voices for high-quality, natural-sounding speech
//
// Required Environment Variables:
// - GCP_PROJECT_ID: Your Google Cloud project ID
// - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key JSON file
//
// API Documentation:
// https://cloud.google.com/text-to-speech/docs/reference/rest
// https://cloud.google.com/text-to-speech/docs/voices

const express = require("express");
const router = express.Router();
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
require("dotenv").config();

// Default voice configuration - Neural2 voices for high quality
const DEFAULT_VOICE_CONFIG = {
  languageCode: "en-US",
  name: "en-US-Neural2-C", // Professional female voice
  ssmlGender: "FEMALE"
};

// Available Neural2 voices (premium quality voices)
const AVAILABLE_VOICES = [
  { voice_id: "en-US-Neural2-C", name: "Sarah - Professional Female", languageCode: "en-US", ssmlGender: "FEMALE" },
  { voice_id: "en-US-Neural2-D", name: "David - Professional Male", languageCode: "en-US", ssmlGender: "MALE" },
  { voice_id: "en-US-Neural2-F", name: "Emma - Energetic Female", languageCode: "en-US", ssmlGender: "FEMALE" },
  { voice_id: "en-US-Neural2-A", name: "James - Authoritative Male", languageCode: "en-US", ssmlGender: "MALE" },
  { voice_id: "en-US-Neural2-E", name: "Isabella - Warm Female", languageCode: "en-US", ssmlGender: "FEMALE" },
  { voice_id: "en-US-Neural2-I", name: "Michael - Conversational Male", languageCode: "en-US", ssmlGender: "MALE" },
  { voice_id: "en-GB-Neural2-A", name: "Oliver - British Male", languageCode: "en-GB", ssmlGender: "MALE" },
  { voice_id: "en-GB-Neural2-B", name: "Sophia - British Female", languageCode: "en-GB", ssmlGender: "FEMALE" },
];

// --------------------
// Convert Text to Speech using Google Cloud TTS
// --------------------
router.post("/tts", async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Get Google Cloud credentials
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      return res.status(500).json({ error: 'Google Cloud project not configured' });
    }

    // Initialize Google Auth
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      return res.status(500).json({ error: 'Failed to get access token' });
    }

    // Find the selected voice configuration
    const selectedVoice = AVAILABLE_VOICES.find(v => v.voice_id === voiceId);
    const voiceConfig = selectedVoice ? {
      languageCode: selectedVoice.languageCode,
      name: selectedVoice.voice_id,
      ssmlGender: selectedVoice.ssmlGender
    } : DEFAULT_VOICE_CONFIG;

    // Google Cloud Text-to-Speech API endpoint
    const ttsApiUrl = `https://texttospeech.googleapis.com/v1/text:synthesize`;

    console.log('Generating speech with Google Cloud TTS...');
    console.log('Voice:', voiceConfig.name);

    // Make request to Google Cloud TTS
    const response = await axios.post(
      ttsApiUrl,
      {
        input: { text },
        voice: voiceConfig,
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
          pitch: 0.0,
          volumeGainDb: 0.0,
          effectsProfileId: ["headphone-class-device"], // Optimized for headphones
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('TTS response received');

    // Extract audio content (base64 encoded)
    const audioContent = response.data.audioContent;
    if (!audioContent) {
      console.error('No audioContent in response');
      return res.status(502).json({ error: 'TTS failed - no audio data returned' });
    }

    // Convert base64 to buffer and send as audio
    const audioBuffer = Buffer.from(audioContent, 'base64');
    
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.send(audioBuffer);

  } catch (error) {
    console.error("TTS Error:", error?.response?.data || error.message);

    // Provide more detailed error messages
    if (error.response?.status === 400) {
      return res.status(400).json({
        error: 'Invalid request to Google Cloud TTS',
        details: error.response?.data?.error?.message || 'Bad request'
      });
    }
    if (error.response?.status === 403) {
      return res.status(403).json({
        error: 'Google Cloud TTS access denied',
        details: 'Check service account permissions and API enablement'
      });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: 'Too many requests to Google Cloud TTS. Please try again later.'
      });
    }

    res.status(500).json({ 
      error: "TTS failed", 
      details: error.message || error 
    });
  }
});

// --------------------
// Get Available Voices
// --------------------
router.get("/voices", async (req, res) => {
  try {
    // Return the predefined list of Neural2 voices
    // These are high-quality voices from Google Cloud TTS
    res.json({ voices: AVAILABLE_VOICES });
  } catch (error) {
    console.error("Voices Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

module.exports = router;
