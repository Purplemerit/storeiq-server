// src/aimodel/routes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { generateVideoAndWait, downloadVideoFromGCS, generateFilenameFromPrompt } = require("../geminiService.js");
const verifyJWT = require("../routes/authMiddleware.js");
const { uploadVideoBuffer } = require("../s3Service.js");
const Video = require("../models/Video");

/**
 * POST /api/gemini-veo3/generate-video
 * Generate video using Veo-3 with automatic polling and S3 upload
 */
router.post("/gemini-veo3/generate-video", verifyJWT, async (req, res) => {
  try {
    const { prompt, quality, voiceSpeed, audioLanguage } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const userId = req.user && req.user._id ? req.user._id.toString() : null;
    const username = req.user && req.user.username ? req.user.username : null;
    
    if (!userId) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Map quality to resolution
    const resolutionMap = {
      '480P': '360p',
      '720P': '720p',
      '1080P': '1080p'
    };
    const resolution = resolutionMap[quality] || '720p';

    console.log(`[Veo-3] Starting video generation for user ${username}`);
    console.log(`[Veo-3] Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`[Veo-3] Resolution: ${resolution}`);
    console.log(`[Veo-3] Audio Language: ${audioLanguage || 'English'}`);

    // Generate video and wait for completion
    const result = await generateVideoAndWait(prompt, {
      resolution: resolution,
      sampleCount: 1,
      modelType: 'standard',
      audioLanguage: audioLanguage || 'English'
      // Note: Removed generateAudio as it may cause internal errors in some regions
    }, {
      maxAttempts: 60,  // 5 minutes max
      pollInterval: 5000
    });

    // Handle mock mode
    if (result.mock) {
      console.log('[Veo-3] Mock mode - returning demo video');
      return res.status(503).json({
        error: result.message,
        mock: true,
        videoUrl: result.videoUrl
      });
    }

    // Video generation completed
    console.log(`[Veo-3] Video generation completed. Processing ${result.videos.length} video(s)`);

    const video = result.videos[0];
    let s3Url = null;
    let s3Key = null;

    // Generate meaningful filename from prompt
    const customFilename = generateFilenameFromPrompt(prompt);

    if (video.type === 'gcs') {
      // Download from GCS
      console.log('[Veo-3] Downloading video from Cloud Storage...');
      const videoBuffer = await downloadVideoFromGCS(video.url);
      console.log(`[Veo-3] Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      // Upload to S3
      console.log('[Veo-3] Uploading to S3...');
      const uploadResult = await uploadVideoBuffer(
        videoBuffer,
        video.mimeType || 'video/mp4',
        userId,
        username,
        {
          customFilename,
          generated: 'veo-3',
          resolution: resolution,
          prompt: prompt.substring(0, 200)
        }
      );
      
      s3Url = uploadResult.url || uploadResult;
      s3Key = uploadResult.key || uploadResult.s3Key;
      console.log('[Veo-3] Upload complete:', s3Key);

    } else if (video.type === 'base64') {
      // Handle base64 encoded video
      console.log('[Veo-3] Processing base64 encoded video...');
      const videoBuffer = Buffer.from(video.videoData, 'base64');
      
      const uploadResult = await uploadVideoBuffer(
        videoBuffer,
        video.mimeType || 'video/mp4',
        userId,
        username,
        {
          customFilename,
          generated: 'veo-3',
          resolution: resolution
        }
      );
      
      s3Url = uploadResult.url || uploadResult;
      s3Key = uploadResult.key || uploadResult.s3Key;
    }

    // Save video metadata to database
    console.log('[Veo-3] Saving video metadata to database...');
    const videoDoc = new Video({
      s3Key: s3Key,
      owner: userId,
      title: customFilename || 'AI Generated Video',
      prompt: prompt,
      provider: 'gemini-veo-3',
      description: `Generated with ${resolution} resolution`,
    });
    await videoDoc.save();
    console.log('[Veo-3] Video metadata saved to database');

    console.log('[Veo-3] ✓ Video generation and upload successful');

    return res.json({
      success: true,
      s3Url: s3Url,
      s3Key: s3Key,
      resolution: resolution,
      duration: 5, // Veo typically generates ~5 second videos
      operationName: result.operationName
    });

  } catch (err) {
    console.error("[Veo-3] Error:", err.message);
    
    // Try to parse JSON error
    try {
      const errorData = JSON.parse(err.message);
      return res.status(errorData.status || 500).json({ 
        error: errorData.message || 'Video generation failed',
        details: errorData.details 
      });
    } catch (e) {
      return res.status(500).json({ 
        error: err.message || 'Video generation failed'
      });
    }
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
      { generated: "true", prompt: prompt.substring(0, 200) }
    );

    // Save video metadata to database
    console.log('[Gemini-VEO] Saving video metadata to database...');
    const videoDoc = new Video({
      s3Key: key,
      owner: userId,
      title: 'AI Generated Video',
      prompt: prompt,
      provider: 'gemini-veo',
    });
    await videoDoc.save();
    console.log('[Gemini-VEO] Video metadata saved to database');

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
