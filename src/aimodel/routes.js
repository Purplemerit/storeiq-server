// src/aimodel/routes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { generateVideo } = require("../geminiService.js");
const verifyJWT = require("../routes/authMiddleware.js");
const { uploadVideoBuffer } = require("../s3Service.js");
// const GeneratedVideo = require("../models/GeneratedVideo"); // if you have this model

router.post("/gemini-veo3/generate-video", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await generateVideo({
      prompt,
      durationSeconds: 8,
      aspectRatio: "16:9",
    });

    res.json({
      success: true,
      video: response.output?.videos?.[0],
    });
  } catch (err) {
    console.error("[/gemini-veo3/generate-video] error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
router.post("/generate-video", verifyJWT, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  try {
    const output = await videoModel.run(prompt);

    if (!output || !output.url) {
      return res.status(502).json({ error: "Gemini VEO model error", details: "Invalid response" });
    }

    const videoUrl = output.url;

    // 🔽 Fetch video file from Gemini VEO
    const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);

    // 🔽 Upload to S3 in user folder
    const username = req.user && req.user.username ? req.user.username : userId;
    const { url, key } = await uploadVideoBuffer(
      buffer,
      "video/mp4",
      userId,
      username,
      { generated: "true" }
    );

    return res.json({
      success: true,
      s3Url: url,
      s3Key: key,
      originalUrl: videoUrl,
    });
  } catch (err) {
    console.error("[/ai/generate-video] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
const generateImage = require("../controllers/imageGeneratorController").generateImage;
router.post("/generate-image", verifyJWT, generateImage);

module.exports = router;
