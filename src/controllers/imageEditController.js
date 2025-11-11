// server/src/controllers/imageEditController.js
//
// Image editing using Google Imagen 3 via Vertex AI
// Uses imagen-3.0-capability-002 model for advanced image editing
//
// Required Environment Variables:
// - GCP_PROJECT_ID: Your Google Cloud project ID
// - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key JSON file
//
// Model: imagen-3.0-capability-002
// Supports: Inpaint removal/insertion, outpainting, background swap, style transfer, instruct editing
//
// API Documentation:
// https://cloud.google.com/vertex-ai/generative-ai/docs/image/edit-images
// https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/projects.locations.publishers.models/predict

const axios = require('axios');
const s3Service = require('../s3Service');
const { getAccessToken } = require('../utils/googleAuth');
const imageEditQueueService = require('../services/imageEditQueueService');
const crypto = require('crypto');

/**
 * Helper function to generate meaningful filename from prompt
 * Creates a short, readable title (max 3-4 words, 30 chars)
 */
function generateMeaningfulFilename(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'edited-image';
  
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
  
  return cleaned || 'edited-image';
}

/**
 * Helper function to generate a short, user-friendly title
 * Takes first 3-4 words from prompt, properly capitalized
 */
function generateShortTitle(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'Edited Image';
  
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
  
  return title || 'Edited Image';
}

/**
 * POST /api/ai/edit-image
 * Body: { prompt: string, imageS3Key: string }
 * Authenticated user context required (req.user)
 *
 * Edits an image using Google Imagen 3 via Vertex AI with queue management
 * Returns job ID and queue position immediately
 * Uses REFERENCE_TYPE_RAW for instruct-based editing
 */
async function editImage(req, res) {
  try {
    console.log('[editImage] Request received:', {
      hasUser: !!req.user,
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body || {}),
      contentType: req.headers['content-type']
    });

    const user = req.user;
    const prompt = req.body?.prompt;
    const imageS3Key = req.body?.imageS3Key;

    console.log('[editImage] Parsed data:', {
      userId: user?.id || user?._id,
      promptLength: prompt?.length,
      imageS3Key: imageS3Key?.substring(0, 50) + '...'
    });

    if (!user) {
      console.error('[editImage] No user found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!prompt || typeof prompt !== 'string') {
      console.error('[editImage] Invalid prompt:', prompt);
      return res.status(400).json({ error: 'Prompt is required' });
    }
    if (!imageS3Key || typeof imageS3Key !== 'string') {
      console.error('[editImage] Invalid imageS3Key:', imageS3Key);
      return res.status(400).json({ error: 'Image S3 key is required' });
    }

    const userId = user.id || user._id;
    const username = user.username || userId;

    // Generate unique job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    console.log(`[Imagen-Edit] User ${username} requesting image edit`);
    console.log(`[Imagen-Edit] Job ID: ${jobId}`);
    console.log(`[Imagen-Edit] Prompt: ${prompt.substring(0, 100)}...`);

    // Define the image edit processor
    const imageEditProcessor = async (jobData) => {
      const { prompt, imageS3Key, userId, username } = jobData;

      console.log(`[Imagen-Edit] Starting image edit for job ${jobId}`);

      // Get Google Cloud credentials
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        throw new Error('Google Cloud project not configured');
      }

      // Fetch image from S3
      console.log('[Imagen-Edit] Fetching image from S3...');
      let imageBuffer;
      try {
        imageBuffer = await s3Service.getFileBuffer(imageS3Key);
      } catch (err) {
        throw new Error('Failed to fetch image from S3: ' + err.message);
      }

      // Get access token using shared auth utility
      const accessToken = await getAccessToken();

      // Convert image to base64
      const imageBase64 = imageBuffer.toString('base64');

      // Use Imagen 3 model for image editing
      const imagenModel = "imagen-3.0-capability-001";
      const location = "us-central1";
      const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}:predict`;

      console.log('[Imagen-Edit] Calling Vertex AI API...');
      const enhancedPrompt = `Transform the image [1]: ${prompt}`;
      
      const startTime = Date.now();

      const requestBody = {
        instances: [
          {
            prompt: enhancedPrompt,
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
          sampleCount: 1
        }
      };

      const vertexResponse = await axios.post(
        vertexApiUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      const apiTime = Date.now() - startTime;
      console.log(`[Imagen-Edit] Image edited in ${apiTime}ms`);

      // Extract the generated image from the response
      const predictions = vertexResponse.data.predictions;
      if (!predictions || !predictions.length) {
        throw new Error('Image editing failed - no predictions returned');
      }

      const imageBase64Output = predictions[0].bytesBase64Encoded;
      if (!imageBase64Output) {
        throw new Error('Image editing failed - no image data returned');
      }

      const editedImageBuffer = Buffer.from(imageBase64Output, 'base64');
      console.log(`[Imagen-Edit] Edited image size: ${(editedImageBuffer.length / 1024).toFixed(2)} KB`);
      
      // Generate meaningful filename from prompt
      const meaningfulFilename = generateMeaningfulFilename(prompt);
      const shortTitle = generateShortTitle(prompt);

      // Upload edited image to S3
      console.log('[Imagen-Edit] Uploading to S3...');
      const s3Result = await s3Service.uploadImageBuffer(
        editedImageBuffer,
        'image/png',
        userId,
        username,
        { 
          edited: "true", 
          prompt,
          customFilename: meaningfulFilename
        }
      );
      
      if (!s3Result || !s3Result.key) {
        throw new Error('Failed to upload edited image to S3');
      }

      console.log(`[Imagen-Edit] Uploaded to S3: ${s3Result.key}`);

      // Save to database
      const Video = require('../models/Video');
      let videoRecord = await Video.findOne({ s3Key: s3Result.key });
      if (!videoRecord) {
        videoRecord = new Video({
          s3Key: s3Result.key,
          owner: userId,
          title: shortTitle,
          description: `Edited: ${prompt}`,
          prompt: prompt,
          provider: 'vertex-ai-imagen-3',
        });
        await videoRecord.save();
        console.log('[Imagen-Edit] Image metadata saved to database');
      }

      // Generate signed download URL
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: process.env.AWS_REGION });
      const getCommand = new GetObjectCommand({ 
        Bucket: process.env.AWS_BUCKET_NAME, 
        Key: s3Result.key 
      });
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

      console.log(`[Imagen-Edit] Image edit complete`);

      return {
        imageUrl: signedUrl,
        url: signedUrl,
        editedImageUrl: signedUrl,
        s3Key: s3Result.key,
        prompt,
        title: shortTitle,
        createdAt: new Date().toISOString(),
        provider: 'vertex-ai-imagen-3',
        editType: 'instruct-editing',
        model: 'imagen-3.0-capability-001',
        processingTime: apiTime
      };
    };

    // Add job to queue
    const queueResult = imageEditQueueService.addJob(jobId, {
      userId,
      username,
      prompt,
      imageS3Key,
      processor: imageEditProcessor
    });

    console.log(`[Imagen-Edit] Job ${jobId} added to queue at position ${queueResult.position}`);

    // Return job info immediately
    return res.status(202).json({
      jobId,
      status: 'queued',
      position: queueResult.position,
      queueLength: queueResult.queueLength,
      estimatedWaitTime: queueResult.estimatedWaitTime,
      message: queueResult.position === 1 && !imageEditQueueService.processing 
        ? 'Your image is being edited...' 
        : `Your image is in queue. Position: ${queueResult.position}`,
      // Client should poll this endpoint
      statusUrl: `/api/ai/edit-image-job-status/${jobId}`
    });

  } catch (err) {
    console.error('[Imagen-Edit] Error:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

/**
 * GET /api/ai/edit-image-job-status/:jobId
 * Check status of an image edit job
 */
async function getEditImageJobStatus(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = imageEditQueueService.getJobStatus(jobId);

    // If completed, return the image data
    if (status.status === 'completed') {
      return res.json({
        jobId,
        status: 'completed',
        imageUrl: status.result.imageUrl,
        url: status.result.url,
        editedImageUrl: status.result.editedImageUrl,
        s3Key: status.result.s3Key,
        title: status.result.title,
        prompt: status.result.prompt,
        completedAt: status.completedAt,
        processingTime: status.processingTime,
        provider: status.result.provider
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
          ? 'Your image is being edited...' 
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
    console.error('[Imagen-Edit] Error getting job status:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

/**
 * GET /api/ai/edit-image-queue-stats
 * Get queue statistics
 */
async function getEditImageQueueStats(req, res) {
  try {
    const stats = imageEditQueueService.getStats();
    return res.json(stats);
  } catch (err) {
    console.error('[Imagen-Edit] Error getting queue stats:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

/**
 * DELETE /api/ai/edit-image-job/:jobId
 * Cancel a job
 */
async function cancelEditImageJob(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const cancelled = imageEditQueueService.cancelJob(jobId);

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
    console.error('[Imagen-Edit] Error cancelling job:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

module.exports = {
  editImage,
  getEditImageJobStatus,
  getEditImageQueueStats,
  cancelEditImageJob,
};