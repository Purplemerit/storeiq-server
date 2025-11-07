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
const ttsQueueService = require('../services/ttsQueueService');
const crypto = require('crypto');
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

    // Wrap the actual TTS generation in a processor function
    const ttsProcessor = async () => {
      // Get Google Cloud credentials
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        throw new Error('Google Cloud project not configured');
      }

      // Initialize Google Auth
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();

      if (!accessToken.token) {
        throw new Error('Failed to get access token');
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
        throw new Error('TTS failed - no audio data returned');
      }

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioContent, 'base64');
      
      return { audioBuffer };
    };

    // Add job to queue
    const jobId = ttsQueueService.addJob(ttsProcessor, {
      textLength: text.length,
      voiceId,
      userId: req.user?.id || 'anonymous',
      createdAt: new Date().toISOString(),
    });

    const status = ttsQueueService.getJobStatus(jobId);

    // Return 202 with job ID
    res.status(202).json({
      jobId,
      status: 'queued',
      position: status.position,
      queueLength: status.queueLength,
      estimatedWaitTime: status.estimatedWaitTime,
      message: 'TTS generation job queued',
    });
  } catch (error) {
    console.error("TTS Error:", error?.response?.data || error.message);
    res.status(500).json({ 
      error: "TTS failed", 
      details: error.message || error 
    });
  }
});

// GET /video-tts/tts-status/:jobId
router.get("/tts-status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = ttsQueueService.getJobStatus(jobId);

    if (status.status === 'not_found') {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (status.status === 'completed') {
      // Return audio buffer as response
      const audioBuffer = status.result?.audioBuffer;
      if (!audioBuffer) {
        return res.status(500).json({ error: 'Audio data not available' });
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      return res.send(audioBuffer);
    }

    if (status.status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        error: status.error,
      });
    }

    // queued or processing
    res.status(200).json({
      status: status.status,
      position: status.position,
      queueLength: status.queueLength,
      estimatedWaitTime: status.estimatedWaitTime,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /video-tts/tts-queue-stats
router.get("/tts-queue-stats", async (req, res) => {
  try {
    const stats = ttsQueueService.getStats();
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// DELETE /video-tts/tts-job/:jobId
router.delete("/tts-job/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const success = ttsQueueService.cancelJob(jobId);

    if (!success) {
      return res.status(400).json({ error: 'Cannot cancel job (not found or already processing)' });
    }

    res.status(200).json({ message: 'Job cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
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
