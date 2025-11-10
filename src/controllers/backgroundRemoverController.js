// server/src/controllers/backgroundRemoverController.js
//
// Background removal using remove.bg API
// Uses remove.bg's powerful AI to automatically remove image backgrounds
//
// Required Environment Variables:
// - REMOVEBG_API_KEY: Your remove.bg API key (get from https://www.remove.bg/dashboard#api-key)
//
// Setup Instructions:
// 1. Sign up at https://www.remove.bg/
// 2. Get your API key from dashboard
// 3. Set REMOVEBG_API_KEY in your .env file
//
// API Documentation:
// https://www.remove.bg/api#remove-background

const axios = require('axios');
const FormData = require('form-data');
const s3Service = require('../s3Service');
const backgroundRemovalQueueService = require('../services/backgroundRemovalQueueService');
const crypto = require('crypto');

/**
 * Helper function to generate meaningful filename from original
 * Adds "no-bg-" prefix to indicate background removed
 */
function generateNoBackgroundFilename(originalFilename) {
  if (!originalFilename || typeof originalFilename !== 'string') {
    return 'no-bg-image';
  }
  
  // Remove extension
  const withoutExt = originalFilename.replace(/\.[^/.]+$/, '');
  
  // Clean and add prefix
  const cleaned = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  
  return `no-bg-${cleaned}`;
}

/**
 * POST /api/ai/remove-background
 * Body: { 
 *   imageS3Key?: string,  // S3 key of uploaded image
 *   imageUrl?: string,     // OR public image URL
 *   size?: string,         // 'preview', 'small', 'regular', 'medium', 'hd', '4k', 'auto' (default: 'auto')
 *   format?: string,       // 'png', 'jpg', 'zip' (default: 'png')
 *   type?: string,         // 'auto', 'person', 'product', 'car', 'animal', 'graphic', 'transportation' (default: 'auto')
 *   typeLevel?: string,    // 'none', '1', '2', 'latest' (default: 'latest')
 *   channels?: string,     // 'rgba', 'alpha' (default: 'rgba')
 *   bgColor?: string,      // Background color hex (e.g., '00FF00' for green)
 *   bgImageUrl?: string,   // Background image URL to composite
 *   semitransparency?: boolean, // Preserve semi-transparency (default: false)
 *   crop?: boolean,        // Crop empty regions (default: false)
 *   scale?: string,        // Scale output (e.g., '50%')
 *   position?: string      // Position if using background ('center', 'original', etc.)
 * }
 * Authenticated user context required (req.user)
 *
 * Removes background from image using remove.bg API with queue management
 * Returns job ID and queue position immediately
 */
async function removeBackground(req, res) {
  try {
    const {
      imageS3Key,
      imageUrl,
      size = 'auto',
      format = 'png',
      type = 'auto',
      typeLevel = 'latest',
      channels = 'rgba',
      bgColor,
      bgImageUrl,
      semitransparency = false,
      crop = false,
      scale,
      position,
      originalFilename
    } = req.body;

    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!imageS3Key && !imageUrl) {
      return res.status(400).json({ 
        error: 'Either imageS3Key or imageUrl is required' 
      });
    }

    const userId = user.id || user._id;
    const username = user.username || userId;

    // Generate unique job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    console.log(`[RemoveBG] User ${username} requesting background removal`);
    console.log(`[RemoveBG] Job ID: ${jobId}`);
    console.log(`[RemoveBG] Source: ${imageS3Key ? `S3:${imageS3Key}` : `URL:${imageUrl}`}`);

    // Define the background removal processor
    const backgroundProcessor = async (jobData) => {
      const {
        imageS3Key,
        imageUrl,
        size,
        format,
        type,
        typeLevel,
        channels,
        bgColor,
        bgImageUrl,
        semitransparency,
        crop,
        scale,
        position,
        userId,
        username,
        originalFilename
      } = jobData;

      console.log(`[RemoveBG] Starting background removal for job ${jobId}`);

      // Check for API key
      const apiKey = process.env.REMOVEBG_API_KEY;
      if (!apiKey) {
        throw new Error('remove.bg API key not configured. Please set REMOVEBG_API_KEY in environment variables.');
      }

      const formData = new FormData();

      // Add image source (either S3 download URL or direct URL)
      if (imageS3Key) {
        // Generate temporary presigned URL for the image
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({ region: process.env.AWS_REGION });
        const getCommand = new GetObjectCommand({ 
          Bucket: process.env.AWS_BUCKET_NAME, 
          Key: imageS3Key 
        });
        const imageDownloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        formData.append('image_url', imageDownloadUrl);
      } else if (imageUrl) {
        formData.append('image_url', imageUrl);
      }

      // Add parameters
      formData.append('size', size);
      if (format && format !== 'png') formData.append('format', format);
      if (type && type !== 'auto') formData.append('type', type);
      if (typeLevel && typeLevel !== 'latest') formData.append('type_level', typeLevel);
      if (channels && channels !== 'rgba') formData.append('channels', channels);
      if (bgColor) formData.append('bg_color', bgColor);
      if (bgImageUrl) formData.append('bg_image_url', bgImageUrl);
      if (semitransparency) formData.append('semitransparency', 'true');
      if (crop) formData.append('crop', 'true');
      if (scale) formData.append('scale', scale);
      if (position) formData.append('position', position);

      console.log('[RemoveBG] Calling remove.bg API...');

      // Call remove.bg API
      const removeBgResponse = await axios.post(
        'https://api.remove.bg/v1.0/removebg',
        formData,
        {
          headers: {
            'X-Api-Key': apiKey,
            ...formData.getHeaders()
          },
          responseType: 'arraybuffer',
          maxContentLength: 50 * 1024 * 1024, // 50MB max
          maxBodyLength: 50 * 1024 * 1024
        }
      );

      console.log('[RemoveBG] API response received');
      
      // Check for rate limiting
      const rateLimitRemaining = removeBgResponse.headers['x-ratelimit-remaining'];
      const rateLimitReset = removeBgResponse.headers['x-ratelimit-reset'];
      const creditsCharged = removeBgResponse.headers['x-credits-charged'];
      
      console.log(`[RemoveBG] Credits charged: ${creditsCharged}, Rate limit remaining: ${rateLimitRemaining}`);

      // Extract the result image
      const imageBuffer = Buffer.from(removeBgResponse.data);

      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Background removal failed - no image data returned');
      }

      // Determine content type based on format
      let contentType = 'image/png';
      if (format === 'jpg') contentType = 'image/jpeg';
      else if (format === 'zip') contentType = 'application/zip';

      // Generate meaningful filename
      const meaningfulFilename = generateNoBackgroundFilename(
        originalFilename || imageS3Key || 'image'
      );

      // Upload to S3 using existing service
      console.log('[RemoveBG] Uploading result to S3...');
      const s3Result = await s3Service.uploadImageBuffer(
        imageBuffer,
        contentType,
        userId,
        username,
        {
          backgroundRemoved: 'true',
          originalImage: imageS3Key || imageUrl,
          customFilename: meaningfulFilename
        }
      );

      if (!s3Result || !s3Result.key) {
        throw new Error('Failed to upload result to S3');
      }

      // Save to database
      const Video = require('../models/Video');
      let videoRecord = await Video.findOne({ s3Key: s3Result.key });
      if (!videoRecord) {
        videoRecord = new Video({
          s3Key: s3Result.key,
          owner: userId,
          title: `${originalFilename || 'Image'} (Background Removed)`,
          description: 'Background removed using remove.bg AI',
          provider: 'remove-bg',
        });
        await videoRecord.save();
        console.log('[RemoveBG] Image metadata saved to database');
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

      console.log('[RemoveBG] Background removal complete');

      return {
        imageUrl: signedUrl,
        url: signedUrl,
        s3Key: s3Result.key,
        originalImage: imageS3Key || imageUrl,
        userId,
        creditsCharged: parseFloat(creditsCharged) || 1,
        rateLimitRemaining: parseInt(rateLimitRemaining) || 0,
        createdAt: new Date().toISOString(),
        provider: 'remove-bg',
        format,
        size
      };
    };

    // Add job to queue
    const queueResult = backgroundRemovalQueueService.addJob(jobId, {
      userId,
      username,
      imageS3Key,
      imageUrl,
      size,
      format,
      type,
      typeLevel,
      channels,
      bgColor,
      bgImageUrl,
      semitransparency,
      crop,
      scale,
      position,
      originalFilename,
      processor: backgroundProcessor
    });

    console.log(`[RemoveBG] Job ${jobId} added to queue at position ${queueResult.position}`);

    // Return job info immediately
    return res.status(202).json({
      jobId,
      status: 'queued',
      position: queueResult.position,
      queueLength: queueResult.queueLength,
      estimatedWaitTime: queueResult.estimatedWaitTime,
      message: queueResult.position === 1 && !backgroundRemovalQueueService.processing
        ? 'Your background is being removed...'
        : `Your request is in queue. Position: ${queueResult.position}`,
      // Client should poll this endpoint
      statusUrl: `/api/ai/bg-removal-status/${jobId}`
    });

  } catch (err) {
    console.error('[RemoveBG] Error:', err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

/**
 * GET /api/ai/bg-removal-status/:jobId
 * Check status of a background removal job
 */
async function getBackgroundRemovalStatus(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = backgroundRemovalQueueService.getJobStatus(jobId);

    // If completed, return the result data
    if (status.status === 'completed') {
      return res.json({
        jobId,
        status: 'completed',
        imageUrl: status.result.imageUrl,
        url: status.result.url,
        s3Key: status.result.s3Key,
        originalImage: status.result.originalImage,
        creditsCharged: status.result.creditsCharged,
        rateLimitRemaining: status.result.rateLimitRemaining,
        completedAt: status.completedAt,
        processingTime: status.processingTime,
        message: 'Background removed successfully!'
      });
    }

    // If failed, return error
    if (status.status === 'failed') {
      return res.status(500).json({
        jobId,
        status: 'failed',
        error: status.error,
        failedAt: status.failedAt,
        message: 'Background removal failed'
      });
    }

    // If processing or queued, return status
    return res.json(status);

  } catch (err) {
    console.error('[RemoveBG] Job status error:', err.message);
    return res.status(500).json({
      error: err.message || 'Failed to get job status'
    });
  }
}

/**
 * GET /api/ai/bg-removal-queue-stats
 * Get background removal queue statistics
 */
async function getBackgroundRemovalQueueStats(req, res) {
  try {
    const stats = backgroundRemovalQueueService.getStats();
    return res.json(stats);
  } catch (err) {
    console.error('[RemoveBG] Queue stats error:', err.message);
    return res.status(500).json({
      error: err.message || 'Failed to get queue stats'
    });
  }
}

/**
 * DELETE /api/ai/bg-removal-job/:jobId
 * Cancel a queued background removal job
 */
async function cancelBackgroundRemovalJob(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = backgroundRemovalQueueService.getJobStatus(jobId);

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

    const removed = backgroundRemovalQueueService.removeJob(jobId);

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
    console.error('[RemoveBG] Job cancellation error:', err.message);
    return res.status(500).json({
      error: err.message || 'Failed to cancel job'
    });
  }
}

module.exports = {
  removeBackground,
  getBackgroundRemovalStatus,
  getBackgroundRemovalQueueStats,
  cancelBackgroundRemovalJob
};
