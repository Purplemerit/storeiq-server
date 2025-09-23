// ttsRoutes.js
const express = require("express");
const router = express.Router();
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js"); // Make sure your API client is properly configured
require("dotenv").config();

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const DEFAULT_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2";

// --------------------
// Convert Text to Speech
// --------------------
router.post("/tts", async (req, res) => {
  try {
    const { text, voiceId, modelId } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const audioStream = await elevenlabs.textToSpeech.convert(
      voiceId || DEFAULT_VOICE_ID,
      {
        text,
        modelId: modelId || "eleven_multilingual_v2",
      }
    );

    // Stream audio directly to response (more efficient for large text)
    res.setHeader("Content-Type", "audio/mpeg");
    for await (const chunk of audioStream) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: "TTS failed", detail: error.message || error });
  }
});

// --------------------
// Get Available Voices
// --------------------
router.get("/voices", async (req, res) => {
  try {
    const result = await elevenlabs.voices.getAll();
    const voices = result.voices || result;
    res.json({ voices });
  } catch (error) {
    console.error("Voices Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

module.exports = router;
