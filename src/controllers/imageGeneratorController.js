// server/src/controllers/imageGeneratorController.js
//
// Image generation using Google Imagen 4
// Uses Vertex AI API (requires OAuth2 authentication with gcloud)
//
// Required Environment Variables:
// - GOOGLE_CLOUD_PROJECT: Your Google Cloud project ID
// - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key JSON file
//
// Setup Instructions:
// 1. Enable Vertex AI API in Google Cloud Console
// 2. Create a service account with Vertex AI User role
// 3. Download JSON key and set path in GOOGLE_APPLICATION_CREDENTIALS
// 4. Set GOOGLE_CLOUD_PROJECT to your project ID
//
// API Documentation:
// https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images

const axios = require('axios');
const s3Service = require('../s3Service');
const { getAccessToken } = require('../utils/googleAuth');
const imageQueueService = require('../services/imageQueueService');
const crypto = require('crypto');

/**
 * Helper function to generate meaningful filename from prompt
 * Creates a short, readable title (max 3-4 words, 30 chars)
 */
function generateMeaningfulFilename(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'generated-image';
  
  // Extract key words from prompt (first 3-4 words only for shorter names)
  let cleaned = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim()
    .split(/\s+/)
    .slice(0, 4) // Only take first 4 words
    .join('-');
  
  // Limit length to 30 characters for shorter names
  if (cleaned.length > 30) {
    cleaned = cleaned.substring(0, 30);
  }
  
  return cleaned || 'generated-image';
}

/**
 * Helper function to generate a short, user-friendly title
 * Takes first 3-4 words from prompt, properly capitalized
 */
function generateShortTitle(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'Generated Image';
  
  // Extract first 3-4 meaningful words
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
    .trim()
    .split(/\s+/)
    .slice(0, 4); // Only take first 4 words
  
  // Capitalize first letter of each word
  const title = words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return title || 'Generated Image';
}

/**
 * POST /api/ai/generate-image
 * Body: { prompt: string, aspectRatio?: string }
 * Authenticated user context required (req.user)
 *
 * Generates an image using Google Imagen 4 via Vertex AI with queue management
 * Returns job ID and queue position immediately
 * 
 * Supported aspect ratios:
 * - "1:1" (1024x1024) - Square
 * - "9:16" (768x1344) - Vertical/Portrait
 * - "16:9" (1344x768) - Horizontal/Landscape
 * - "4:3" (1152x896) - Standard
 * - "3:4" (896x1152) - Portrait
 */
async function generateImage(req, res) {
  try {
    const { prompt, aspectRatio } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const userId = user.id || user._id;
    const username = user.username || userId;

    // Generate unique job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    // Validate aspect ratio if provided
    const validAspectRatios = ['1:1', '9:16', '16:9', '4:3', '3:4'];
    const selectedAspectRatio = aspectRatio && validAspectRatios.includes(aspectRatio) 
      ? aspectRatio 
      : '1:1'; // Default to square

    console.log(`[Imagen] User ${username} requesting image generation`);
    console.log(`[Imagen] Job ID: ${jobId}`);
    console.log(`[Imagen] Prompt: ${prompt.substring(0, 100)}...`);

    // Define the image generation processor
    const imageProcessor = async (jobData) => {
      const { prompt, aspectRatio, userId, username } = jobData;

      console.log(`[Imagen] Starting image generation for job ${jobId}`);

      // Get Google Cloud credentials
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        throw new Error('Google Cloud project not configured');
      }

      // Get access token using shared auth utility
      const accessToken = await getAccessToken();

      // Use Imagen 4 Fast model for image generation
      const imagenModel = "imagen-4.0-fast-generate-001";
      const location = "us-central1";
      const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}:predict`;

      console.log('[Imagen] Calling Vertex AI API...');
      const vertexResponse = await axios.post(
        vertexApiUrl,
        {
          instances: [
            {
              prompt: prompt
            }
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectRatio
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
        }
      );

      console.log('[Imagen] Vertex AI API response received');

      // The API returns predictions array
      const predictions = vertexResponse.data.predictions;
      if (!predictions || !predictions.length) {
        throw new Error('Image generation failed - no predictions returned');
      }

      // Extract the base64 image from the response
      const imageBase64 = predictions[0].bytesBase64Encoded;
      if (!imageBase64) {
        throw new Error('Image generation failed - no image data returned');
      }

      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      // Generate meaningful filename from prompt (short version for file system)
      const meaningfulFilename = generateMeaningfulFilename(prompt);
      
      // Generate short, user-friendly title for display
      const shortTitle = generateShortTitle(prompt);
      
      // Upload to S3 using existing service
      console.log('[Imagen] Uploading to S3...');
      const s3Result = await s3Service.uploadImageBuffer(
        imageBuffer,
        'image/png',
        userId,
        username,
        { 
          generated: "true", 
          prompt,
          customFilename: meaningfulFilename
        }
      );
      
      if (!s3Result || !s3Result.key) {
        throw new Error('Failed to upload image to S3');
      }

      // Save to database
      const Video = require('../models/Video');
      let videoRecord = await Video.findOne({ s3Key: s3Result.key });
      if (!videoRecord) {
        videoRecord = new Video({
          s3Key: s3Result.key,
          owner: userId,
          title: shortTitle,
          description: prompt,
          prompt: prompt,
          provider: 'vertex-ai-imagen-4',
        });
        await videoRecord.save();
        console.log('[Imagen] Image metadata saved to database');
      }

      // Generate signed download URL
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: process.env.AWS_REGION });
      const getCommand = new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Result.key });
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

      console.log('[Imagen] Image generation complete');

      return {
        imageUrl: signedUrl,
        url: signedUrl,
        s3Key: s3Result.key,
        prompt,
        userId,
        title: shortTitle,
        createdAt: new Date().toISOString(),
        provider: 'vertex-ai-imagen-4',
      };
    };

    // Add job to queue
    const queueResult = imageQueueService.addJob(jobId, {
      userId,
      username,
      prompt,
      aspectRatio: selectedAspectRatio,
      processor: imageProcessor
    });

    console.log(`[Imagen] Job ${jobId} added to queue at position ${queueResult.position}`);

    // Return job info immediately
    return res.status(202).json({
      jobId,
      status: 'queued',
      position: queueResult.position,
      queueLength: queueResult.queueLength,
      estimatedWaitTime: queueResult.estimatedWaitTime,
      message: queueResult.position === 1 && !imageQueueService.processing 
        ? 'Your image is being generated...' 
        : `Your image is in queue. Position: ${queueResult.position}`,
      // Client should poll this endpoint
      statusUrl: `/api/ai/image-job-status/${jobId}`
    });

  } catch (err) {
    console.error('[Imagen] Error:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

/**
 * GET /api/ai/image-job-status/:jobId
 * Check status of an image generation job
 */
async function getImageJobStatus(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = imageQueueService.getJobStatus(jobId);

    // If completed, return the image data
    if (status.status === 'completed') {
      return res.json({
        jobId,
        status: 'completed',
        imageUrl: status.result.imageUrl,
        url: status.result.url,
        s3Key: status.result.s3Key,
        title: status.result.title,
        prompt: status.result.prompt,
        completedAt: status.completedAt,
        processingTime: status.processingTime,
        message: 'Image generated successfully!'
      });
    }

    // If failed, return error
    if (status.status === 'failed') {
      return res.status(500).json({
        jobId,
        status: 'failed',
        error: status.error,
        failedAt: status.failedAt,
        message: 'Image generation failed'
      });
    }

    // If processing or queued, return status
    return res.json(status);

  } catch (err) {
    console.error('[Imagen] Job status error:', err.message);
    return res.status(500).json({ 
      error: err.message || 'Failed to get job status'
    });
  }
}

/**
 * GET /api/ai/image-queue-stats
 * Get image queue statistics
 */
async function getImageQueueStats(req, res) {
  try {
    const stats = imageQueueService.getStats();
    return res.json(stats);
  } catch (err) {
    console.error('[Imagen] Queue stats error:', err.message);
    return res.status(500).json({ 
      error: err.message || 'Failed to get queue stats'
    });
  }
}

/**
 * DELETE /api/ai/image-job/:jobId
 * Cancel a queued image job
 */
async function cancelImageJob(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = imageQueueService.getJobStatus(jobId);
    
    if (status.status === 'not_found') {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (status.status === 'processing') {
      return res.status(400).json({ 
        error: 'Cannot cancel job that is currently processing' 
      });
    }

    if (status.status === 'completed' || status.status === 'failed') {
      return res.status(400).json({ 
        error: 'Cannot cancel completed or failed job' 
      });
    }

    const removed = imageQueueService.removeJob(jobId);

    if (removed) {
      return res.json({ 
        message: 'Job cancelled successfully',
        jobId 
      });
    } else {
      return res.status(400).json({ 
        error: 'Failed to cancel job' 
      });
    }

  } catch (err) {
    console.error('[Imagen] Job cancellation error:', err.message);
    return res.status(500).json({ 
      error: err.message || 'Failed to cancel job'
    });
  }
}

module.exports = {
  generateImage,
  getImageJobStatus,
  getImageQueueStats,
  cancelImageJob,
};