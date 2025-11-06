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

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/remove-bg
 * Removes background from uploaded image using Google Imagen 3
 * Returns the processed image URL after uploading to S3
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

    // Get Google Cloud credentials
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      return res.status(500).json({ error: 'Google Cloud project not configured' });
    }

    // Initialize Google Auth
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      return res.status(500).json({ error: 'Failed to get access token' });
    }

    // Convert image to base64
    const imageBase64 = req.file.buffer.toString('base64');

    // Use Imagen 3 model for background removal
    // We'll use instruct-based editing with a prompt to remove the background
    const imagenModel = "imagen-3.0-capability-001";
    const location = "us-central1";
    const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}:predict`;

    console.log('[remove-bg] Removing background with Imagen 3...');

    // Build request for background removal using instruct editing
    // Prompt instructs the model to remove the background and keep only the main subject
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
        // These parameters help with background removal
        guidance: 15, // Higher guidance for better adherence to prompt
        seed: Math.floor(Math.random() * 1000000) // Random seed for variety
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

    console.log('[remove-bg] Vertex AI API response received');

    // Extract the generated image from the response
    const predictions = vertexResponse.data.predictions;
    if (!predictions || !predictions.length) {
      console.error('[remove-bg] No predictions in response:', vertexResponse.data);
      return res.status(502).json({ error: 'Background removal failed - no predictions returned' });
    }

    // Extract base64 image from predictions
    const imageBase64Output = predictions[0].bytesBase64Encoded;
    if (!imageBase64Output) {
      console.error('[remove-bg] No bytesBase64Encoded in response:', predictions[0]);
      return res.status(502).json({ error: 'Background removal failed - no image data returned' });
    }

    const processedImageBuffer = Buffer.from(imageBase64Output, 'base64');
    
    // Generate filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const filename = `bg-removed-${timestamp}-${randomId}`;

    // Upload processed image to S3
    // Note: Using a generic user ID since this endpoint might not have authenticated user
    const userId = req.user?.id || req.user?._id || 'anonymous';
    const username = req.user?.username || 'anonymous';

    const s3Result = await s3Service.uploadImageBuffer(
      processedImageBuffer,
      'image/png',
      userId,
      username,
      { 
        backgroundRemoved: "true",
        originalFilename: req.file.originalname,
        customFilename: filename
      }
    );

    if (!s3Result || !s3Result.key) {
      return res.status(502).json({ error: 'Failed to upload processed image to S3' });
    }

    console.log('[remove-bg] Image uploaded to S3:', s3Result.key);

    // Generate signed download URL
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    const getCommand = new GetObjectCommand({ 
      Bucket: process.env.AWS_BUCKET_NAME, 
      Key: s3Result.key 
    });
    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    return res.json({
      url: signedUrl,
      s3Key: s3Result.key,
      public_id: s3Result.key, // For backward compatibility
      message: 'Background removed successfully',
      provider: 'vertex-ai-imagen-3',
      model: 'imagen-3.0-capability-001'
    });

  } catch (err) {
    console.error('[remove-bg] Error:', err?.response?.data || err.message);

    // Provide more detailed error messages
    if (err.response?.status === 400) {
      return res.status(400).json({
        error: 'Invalid request to Vertex AI',
        details: err.response?.data?.error?.message || 'Bad request'
      });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({
        error: 'Vertex AI access denied',
        details: 'Check service account permissions and API enablement'
      });
    }
    if (err.response?.status === 404) {
      return res.status(404).json({
        error: 'Imagen model not found',
        details: 'The Imagen 3 model may not be available in your region'
      });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: 'Too many requests to Vertex AI. Please try again later.'
      });
    }

    return res.status(500).json({
      error: 'Background removal failed',
      details: err.message
    });
  }
});

module.exports = router;
