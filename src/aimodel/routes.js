// src/aimodel/routes.js
const express = require("express");
const axios = require("axios");
const router = express.Router();
const videoModel = require("./bytez");
const verifyJWT = require("../routes/authMiddleware"); 
const { uploadVideoBuffer } = require("../s3Service"); // ✅ reuse your upload logic
// const GeneratedVideo = require("../models/GeneratedVideo"); // if you have this model

router.post("/generate-video", verifyJWT, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  try {
    const { error, output } = await videoModel.run(prompt);

    if (error) {
      return res.status(502).json({ error: "Bytez model error", details: error });
    }

    let videoUrl = null;
    let s3Url = null;
    let s3Key = null;

    if (typeof output === "string" && output.startsWith("http")) {
      videoUrl = output;

      // 🔽 Fetch video file from Bytez
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
      s3Url = url;
      s3Key = key;
    }

    // 🔽 Save metadata (don’t break if DB fails)
    // try {
    //   if (GeneratedVideo) {
    //     await GeneratedVideo.create({
    //       user: userId,
    //       prompt,
    //       url: s3Url || videoUrl, // prefer S3
    //       output: typeof output === "string" ? output : JSON.stringify(output),
    //     });
    //   }
    // } catch (saveErr) {
    //   console.error("[/ai/generate-video] Failed to save GeneratedVideo:", saveErr);
    // }

    return res.json({
      success: true,
      s3Url,
      s3Key,
      originalUrl: videoUrl,
    });
  } catch (err) {
    console.error("[/ai/generate-video] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
