// server/src/ai-tools/mobtool.js
//
// Background removal using Google Imagen 3 via Vertex AI
// Uses imagen-3.0-capability-001 model for background removal and object extraction
//
// Required Environment Variables:
// - GCP_PROJECT_ID: Your Google Cloud project ID
// - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key JSON file
//
// Model: imagen-3.0-capability-001
// Supports: Background removal, object extraction, segmentation
//
// API Documentation:
// https://cloud.google.com/vertex-ai/generative-ai/docs/image/edit-images
// https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/projects.locations.publishers.models/predict

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const s3Service = require('../s3Service');
const bgRemovalQueueService = require('../services/bgRemovalQueueService');
const crypto = require('crypto');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/remove-bg
 * Removes background from uploaded image using Google Imagen 3 with queue management
 * Returns job ID and queue position immediately
 */
router.post("/remove-bg", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded." });
    }

    console.log('[remove-bg] Processing image:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const userId = req.user?.id || req.user?._id || 'anonymous';
    const username = req.user?.username || 'anonymous';

    // Generate unique job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    console.log(`[BgRemoval] User ${username} requesting background removal`);
    console.log(`[BgRemoval] Job ID: ${jobId}`);
    console.log(`[BgRemoval] File: ${req.file.originalname}`);

    // Define the background removal processor
    const bgRemovalProcessor = async (jobData) => {
      const { imageBuffer, filename, userId, username } = jobData;

      console.log(`[BgRemoval] Starting background removal for job ${jobId}`);

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

      // Convert image to base64
      const imageBase64 = imageBuffer.toString('base64');

      // Use Imagen 3 model for background removal
      const imagenModel = "imagen-3.0-capability-001";
      const location = "us-central1";
      const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}:predict`;

      console.log('[BgRemoval] Calling Vertex AI API...');

      const startTime = Date.now();

      // Build request for background removal using instruct editing
      const requestBody = {
        instances: [
          {
            prompt: "Remove the background completely, keep only the main subject/object with transparent background",
            referenceImages: [
              {
                referenceType: "REFERENCE_TYPE_RAW",
                referenceId: 1,
                referenceImage: {
                  bytesBase64Encoded: imageBase64
                }
              }
            ]
          }
        ],
        parameters: {
          sampleCount: 1,
          guidance: 15, // Higher guidance for better adherence to prompt
          seed: Math.floor(Math.random() * 1000000)
        }
      };

      const vertexResponse = await axios.post(
        vertexApiUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      const apiTime = Date.now() - startTime;
      console.log(`[BgRemoval] Background removed in ${apiTime}ms`);

      // Extract the generated image from the response
      const predictions = vertexResponse.data.predictions;
      if (!predictions || !predictions.length) {
        throw new Error('Background removal failed - no predictions returned');
      }

      const imageBase64Output = predictions[0].bytesBase64Encoded;
      if (!imageBase64Output) {
        throw new Error('Background removal failed - no image data returned');
      }

      const processedImageBuffer = Buffer.from(imageBase64Output, 'base64');
      console.log(`[BgRemoval] Processed image size: ${(processedImageBuffer.length / 1024).toFixed(2)} KB`);
      
      // Generate filename
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const processedFilename = `bg-removed-${timestamp}-${randomId}`;

      // Upload processed image to S3
      console.log('[BgRemoval] Uploading to S3...');
      const s3Result = await s3Service.uploadImageBuffer(
        processedImageBuffer,
        'image/png',
        userId,
        username,
        { 
          backgroundRemoved: "true",
          originalFilename: filename,
          customFilename: processedFilename
        }
      );

      if (!s3Result || !s3Result.key) {
        throw new Error('Failed to upload processed image to S3');
      }

      console.log(`[BgRemoval] Uploaded to S3: ${s3Result.key}`);

      // Generate signed download URL
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: process.env.AWS_REGION });
      const getCommand = new GetObjectCommand({ 
        Bucket: process.env.AWS_BUCKET_NAME, 
        Key: s3Result.key 
      });
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

      console.log(`[BgRemoval] Background removal complete`);

      return {
        url: signedUrl,
        s3Key: s3Result.key,
        public_id: s3Result.key, // For backward compatibility
        message: 'Background removed successfully',
        provider: 'vertex-ai-imagen-3',
        model: 'imagen-3.0-capability-001',
        processingTime: apiTime
      };
    };

    // Add job to queue
    const queueResult = bgRemovalQueueService.addJob(jobId, {
      userId,
      username,
      imageBuffer: req.file.buffer,
      filename: req.file.originalname,
      processor: bgRemovalProcessor
    });

    console.log(`[BgRemoval] Job ${jobId} added to queue at position ${queueResult.position}`);

    // Return job info immediately
    return res.status(202).json({
      jobId,
      status: 'queued',
      position: queueResult.position,
      queueLength: queueResult.queueLength,
      estimatedWaitTime: queueResult.estimatedWaitTime,
      message: queueResult.position === 1 && !bgRemovalQueueService.processing 
        ? 'Your image is being processed...' 
        : `Your image is in queue. Position: ${queueResult.position}`,
      // Client should poll this endpoint
      statusUrl: `/api/remove-bg-status/${jobId}`
    });

  } catch (err) {
    console.error('[BgRemoval] Error:', err.message);
    return res.status(500).json({
      error: 'Background removal failed',
      details: err.message
    });
  }
});

/**
 * GET /api/remove-bg-status/:jobId
 * Check status of a background removal job
 */
router.get("/remove-bg-status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = bgRemovalQueueService.getJobStatus(jobId);

    // If completed, return the processed image data
    if (status.status === 'completed') {
      return res.json({
        jobId,
        status: 'completed',
        url: status.result.url,
        s3Key: status.result.s3Key,
        public_id: status.result.public_id,
        message: status.result.message,
        provider: status.result.provider,
        model: status.result.model,
        completedAt: status.completedAt,
        processingTime: status.processingTime
      });
    }

    // If failed, return error
    if (status.status === 'failed') {
      return res.json({
        jobId,
        status: 'failed',
        error: status.error,
        failedAt: status.failedAt
      });
    }

    // If queued or processing, return status
    if (status.status === 'queued' || status.status === 'processing') {
      return res.json({
        jobId,
        status: status.status,
        position: status.position,
        queueLength: status.queueLength,
        estimatedWaitTime: status.estimatedWaitTime,
        message: status.status === 'processing' 
          ? 'Your image is being processed...' 
          : `In queue at position ${status.position}`
      });
    }

    // Not found
    return res.status(404).json({
      jobId,
      status: 'not_found',
      error: 'Job not found'
    });

  } catch (err) {
    console.error('[BgRemoval] Error getting job status:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

/**
 * GET /api/remove-bg-queue-stats
 * Get queue statistics
 */
router.get("/remove-bg-queue-stats", async (req, res) => {
  try {
    const stats = bgRemovalQueueService.getStats();
    return res.json(stats);
  } catch (err) {
    console.error('[BgRemoval] Error getting queue stats:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

/**
 * DELETE /api/remove-bg-job/:jobId
 * Cancel a background removal job
 */
router.delete("/remove-bg-job/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const cancelled = bgRemovalQueueService.cancelJob(jobId);

    if (cancelled) {
      return res.json({
        jobId,
        status: 'cancelled',
        message: 'Job cancelled successfully'
      });
    } else {
      return res.status(400).json({
        jobId,
        error: 'Job cannot be cancelled (not in queue or already processing)'
      });
    }

  } catch (err) {
    console.error('[BgRemoval] Error cancelling job:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

module.exports = router;
