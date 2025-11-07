// src/aimodel/routes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { generateVideoAndWait, downloadVideoFromGCS, generateFilenameFromPrompt } = require("../geminiService.js");
const verifyJWT = require("../routes/authMiddleware.js");
const { uploadVideoBuffer } = require("../s3Service.js");
const Video = require("../models/Video");
const videoQueueService = require("../services/videoQueueService.js");
const crypto = require("crypto");

/**
 * POST /api/gemini-veo3/generate-video
 * Generate video using Veo-3 with queue management
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

    // Generate unique job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    // Map quality to resolution
    const resolutionMap = {
      '480P': '360p',
      '720P': '720p',
      '1080P': '1080p'
    };
    const resolution = resolutionMap[quality] || '720p';

    console.log(`[Veo-3] User ${username} requesting video generation`);
    console.log(`[Veo-3] Job ID: ${jobId}`);
    console.log(`[Veo-3] Prompt: ${prompt.substring(0, 100)}...`);

    // Define the video generation processor
    const videoProcessor = async (jobData) => {
      const { prompt, resolution, audioLanguage, userId, username } = jobData;

      console.log(`[Veo-3] Starting video generation for job ${jobId}`);
      console.log(`[Veo-3] Resolution: ${resolution}`);
      console.log(`[Veo-3] Audio Language: ${audioLanguage || 'English'}`);

      // Generate video and wait for completion
      const result = await generateVideoAndWait(prompt, {
        resolution: resolution,
        sampleCount: 1,
        modelType: 'standard',
        audioLanguage: audioLanguage || 'English'
      }, {
        maxAttempts: 60,
        pollInterval: 5000
      });

      // Handle mock mode
      if (result.mock) {
        console.log('[Veo-3] Mock mode - returning demo video');
        throw new Error(result.message);
      }

      console.log(`[Veo-3] Video generation completed for job ${jobId}`);

      const video = result.videos[0];
      let s3Url = null;
      let s3Key = null;

      const customFilename = generateFilenameFromPrompt(prompt);

      if (video.type === 'gcs') {
        console.log('[Veo-3] Downloading video from Cloud Storage...');
        const videoBuffer = await downloadVideoFromGCS(video.url);
        console.log(`[Veo-3] Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

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

      return {
        s3Url,
        s3Key,
        resolution,
        duration: 5,
        operationName: result.operationName
      };
    };

    // Add job to queue
    const queueResult = videoQueueService.addJob(jobId, {
      userId,
      username,
      prompt,
      resolution,
      audioLanguage,
      processor: videoProcessor
    });

    console.log(`[Veo-3] Job ${jobId} added to queue at position ${queueResult.position}`);

    // Return job info immediately
    return res.status(202).json({
      jobId,
      status: 'queued',
      position: queueResult.position,
      queueLength: queueResult.queueLength,
      estimatedWaitTime: queueResult.estimatedWaitTime,
      message: queueResult.position === 1 && !videoQueueService.processing 
        ? 'Your video is being generated...' 
        : `Your video is in queue. Position: ${queueResult.position}`,
      // Client should poll this endpoint
      statusUrl: `/api/gemini-veo3/job-status/${jobId}`
    });

  } catch (err) {
    console.error("[Veo-3] Error:", err.message);
    
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

/**
 * GET /api/gemini-veo3/job-status/:jobId
 * Check status of a video generation job
 */
router.get("/gemini-veo3/job-status/:jobId", verifyJWT, async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required" });
    }

    const status = videoQueueService.getJobStatus(jobId);

    // If completed, return the video data
    if (status.status === 'completed') {
      return res.json({
        jobId,
        status: 'completed',
        s3Url: status.result.s3Url,
        s3Key: status.result.s3Key,
        resolution: status.result.resolution,
        duration: status.result.duration,
        completedAt: status.completedAt,
        processingTime: status.processingTime,
        message: 'Video generated successfully!'
      });
    }

    // If failed, return error
    if (status.status === 'failed') {
      return res.status(500).json({
        jobId,
        status: 'failed',
        error: status.error,
        failedAt: status.failedAt,
        message: 'Video generation failed'
      });
    }

    // If processing or queued, return status
    return res.json(status);

  } catch (err) {
    console.error("[Veo-3] Job status error:", err.message);
    return res.status(500).json({ 
      error: err.message || 'Failed to get job status'
    });
  }
});

/**
 * GET /api/gemini-veo3/queue-stats
 * Get queue statistics (admin or monitoring)
 */
router.get("/gemini-veo3/queue-stats", verifyJWT, async (req, res) => {
  try {
    const stats = videoQueueService.getStats();
    return res.json(stats);
  } catch (err) {
    console.error("[Veo-3] Queue stats error:", err.message);
    return res.status(500).json({ 
      error: err.message || 'Failed to get queue stats'
    });
  }
});

/**
 * DELETE /api/gemini-veo3/job/:jobId
 * Cancel a queued job (cannot cancel if already processing)
 */
router.delete("/gemini-veo3/job/:jobId", verifyJWT, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user._id.toString();

    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required" });
    }

    // Check if job exists and belongs to user
    const status = videoQueueService.getJobStatus(jobId);
    
    if (status.status === 'not_found') {
      return res.status(404).json({ error: "Job not found" });
    }

    if (status.status === 'processing') {
      return res.status(400).json({ 
        error: "Cannot cancel job that is currently processing" 
      });
    }

    if (status.status === 'completed' || status.status === 'failed') {
      return res.status(400).json({ 
        error: "Cannot cancel completed or failed job" 
      });
    }

    // Remove job from queue
    const removed = videoQueueService.removeJob(jobId);

    if (removed) {
      return res.json({ 
        message: "Job cancelled successfully",
        jobId 
      });
    } else {
      return res.status(400).json({ 
        error: "Failed to cancel job" 
      });
    }

  } catch (err) {
    console.error("[Veo-3] Job cancellation error:", err.message);
    return res.status(500).json({ 
      error: err.message || 'Failed to cancel job'
    });
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
