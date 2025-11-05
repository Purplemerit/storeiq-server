/**
 * Veo-3 Video Generation API Routes
 * Handles video generation, status polling, and video retrieval
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const { 
  generateVideo, 
  getVideoOperationStatus,
  generateVideoAndWait,
  downloadVideoFromGCS
} = require('../geminiService');
const { uploadVideoBuffer } = require('../s3Service');

/**
 * POST /api/veo/generate
 * Start video generation (returns operation immediately)
 * Body: {
 *   prompt: string,
 *   resolution: '360p' | '720p' | '1080p',
 *   sampleCount: 1 | 2,
 *   generateAudio: boolean,
 *   modelType: 'standard' | 'fast' | 'v2'
 * }
 */
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, resolution, sampleCount, generateAudio, modelType } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt' });
    }

    const videoConfig = {
      resolution: resolution || '720p',
      sampleCount: sampleCount || 1,
      generateAudio: generateAudio !== undefined ? generateAudio : true,
      modelType: modelType || 'standard'
    };

    const result = await generateVideo(prompt, videoConfig);

    // Handle mock mode
    if (result.mock) {
      return res.status(503).json({
        error: result.message,
        mock: true,
        videoUrl: result.videoUrl
      });
    }

    // Return operation info for client to poll
    res.status(202).json({
      message: 'Video generation started',
      operationName: result.operationName,
      statusUrl: result.statusUrl,
      status: result.status
    });

  } catch (err) {
    console.error('Error starting video generation:', err);
    
    // Try to parse error if it's JSON
    try {
      const errorData = JSON.parse(err.message);
      return res.status(errorData.status || 500).json({
        error: errorData.message,
        details: errorData.details
      });
    } catch (e) {
      return res.status(500).json({ error: err.message });
    }
  }
});

/**
 * GET /api/veo/status/:operationName
 * Check status of video generation operation
 */
router.get('/status/:operationName(*)', authMiddleware, async (req, res) => {
  try {
    // The operationName includes slashes, so we use * to capture it all
    const operationName = req.params.operationName;

    if (!operationName) {
      return res.status(400).json({ error: 'Missing operation name' });
    }

    const status = await getVideoOperationStatus(operationName);

    res.status(200).json(status);

  } catch (err) {
    console.error('Error checking operation status:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/veo/generate-and-wait
 * Generate video and wait for completion (blocking request)
 * Body: {
 *   prompt: string,
 *   resolution: '360p' | '720p' | '1080p',
 *   sampleCount: 1 | 2,
 *   generateAudio: boolean,
 *   modelType: 'standard' | 'fast' | 'v2',
 *   uploadToS3: boolean (default: false)
 * }
 */
router.post('/generate-and-wait', authMiddleware, async (req, res) => {
  try {
    const { 
      prompt, 
      resolution, 
      sampleCount, 
      generateAudio, 
      modelType,
      uploadToS3,
      maxAttempts,
      pollInterval 
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt' });
    }

    const videoConfig = {
      resolution: resolution || '720p',
      sampleCount: sampleCount || 1,
      generateAudio: generateAudio !== undefined ? generateAudio : true,
      modelType: modelType || 'standard'
    };

    const pollingOptions = {
      maxAttempts: maxAttempts || 60,  // 5 minutes with 5s interval
      pollInterval: pollInterval || 5000
    };

    // Generate and wait for completion
    const result = await generateVideoAndWait(prompt, videoConfig, pollingOptions);

    // Handle mock mode
    if (result.mock) {
      return res.status(503).json({
        error: result.message,
        mock: true,
        videoUrl: result.videoUrl
      });
    }

    // Process completed videos
    const processedVideos = [];
    
    for (const video of result.videos) {
      if (uploadToS3 && video.type === 'gcs') {
        // Download from GCS and upload to S3
        try {
          const userId = req.user._id.toString();
          const username = req.user.username || userId;
          
          const videoBuffer = await downloadVideoFromGCS(video.url);
          const s3Url = await uploadVideoBuffer(videoBuffer, userId, username, {
            contentType: video.mimeType
          });
          
          processedVideos.push({
            ...video,
            s3Url,
            uploadedToS3: true
          });
        } catch (uploadErr) {
          console.error('Error uploading to S3:', uploadErr);
          processedVideos.push({
            ...video,
            uploadedToS3: false,
            uploadError: uploadErr.message
          });
        }
      } else {
        processedVideos.push(video);
      }
    }

    res.status(200).json({
      status: 'COMPLETED',
      videos: processedVideos,
      operationName: result.operationName
    });

  } catch (err) {
    console.error('Error generating video:', err);
    
    // Try to parse error if it's JSON
    try {
      const errorData = JSON.parse(err.message);
      return res.status(errorData.status || 500).json({
        error: errorData.message,
        details: errorData.details
      });
    } catch (e) {
      return res.status(500).json({ error: err.message });
    }
  }
});

/**
 * POST /api/veo/download-and-upload
 * Download video from GCS and upload to S3
 * Body: {
 *   gcsUri: string
 * }
 */
router.post('/download-and-upload', authMiddleware, async (req, res) => {
  try {
    const { gcsUri } = req.body;

    if (!gcsUri || typeof gcsUri !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid gcsUri' });
    }

    const userId = req.user._id.toString();
    const username = req.user.username || userId;

    // Download from GCS
    const videoBuffer = await downloadVideoFromGCS(gcsUri);

    // Upload to S3
    const s3Url = await uploadVideoBuffer(videoBuffer, userId, username, {
      contentType: 'video/mp4'
    });

    res.status(200).json({
      success: true,
      s3Url,
      gcsUri
    });

  } catch (err) {
    console.error('Error downloading and uploading video:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
