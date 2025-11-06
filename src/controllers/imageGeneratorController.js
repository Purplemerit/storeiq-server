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
const { GoogleAuth } = require('google-auth-library');

/**
 * Helper function to generate meaningful filename from prompt
 * Similar to video generation
 */
function generateMeaningfulFilename(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'generated-image';
  
  // Extract key words from prompt (first 5-6 words, max 50 chars)
  let cleaned = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-');
  
  // Limit length
  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 50);
  }
  
  return cleaned || 'generated-image';
}

/**
 * POST /api/ai/generate-image
 * Body: { prompt: string }
 * Authenticated user context required (req.user)
 *
 * Generates an image using Google Imagen 4 via Vertex AI
 * Returns the image URL after uploading to S3
 */
async function generateImage(req, res) {
  try {
    const { prompt } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

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

    // Use Imagen 4 Fast model for image generation
    const imagenModel = "imagen-4.0-fast-generate-001";
    const location = "us-central1";
    const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}:predict`;

    console.log('Generating image with Imagen 4 Fast...');
    const vertexResponse = await axios.post(
      vertexApiUrl,
      {
        instances: [
          {
            prompt: prompt
          }
        ],
        parameters: {
          sampleCount: 1
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        },
      }
    );

    console.log('Vertex AI API response received');

    // The API returns predictions array
    const predictions = vertexResponse.data.predictions;
    if (!predictions || !predictions.length) {
      console.error('No predictions in response:', vertexResponse.data);
      return res.status(502).json({ error: 'Image generation failed - no predictions returned' });
    }

    // Extract the base64 image from the response
    // Vertex AI returns images in base64 format in predictions[0].bytesBase64Encoded
    const imageBase64 = predictions[0].bytesBase64Encoded;
    if (!imageBase64) {
      console.error('No bytesBase64Encoded in response:', predictions[0]);
      return res.status(502).json({ error: 'Image generation failed - no image data returned' });
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    // Generate meaningful filename from prompt (similar to video generation)
    const meaningfulFilename = generateMeaningfulFilename(prompt);
    
    // Upload to S3 using existing service
    const userId = user.id || user._id;
    const username = user.username || userId;
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
      return res.status(502).json({ error: 'Failed to upload image to S3' });
    }

    // Save to database (same as video registration)
    const Video = require('../models/Video');
    let videoRecord = await Video.findOne({ s3Key: s3Result.key });
    if (!videoRecord) {
      videoRecord = new Video({
        s3Key: s3Result.key,
        owner: userId,
        title: meaningfulFilename,
        description: prompt,
        prompt: prompt,
        provider: 'vertex-ai-imagen-4',
      });
      await videoRecord.save();
      console.log('Image metadata saved to database');
    }

    // Generate signed download URL
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    const getCommand = new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Result.key });
    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    // Respond with metadata
    return res.json({
      imageUrl: signedUrl,
      url: signedUrl,
      s3Key: s3Result.key,
      prompt,
      userId,
      title: meaningfulFilename,
      createdAt: new Date().toISOString(),
      provider: 'vertex-ai-imagen-4',
    });
  } catch (err) {
    console.error('Image generation error:', err.response?.data || err.message);

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
        details: 'The Imagen model may not be available in your region'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
}

module.exports = {
  generateImage,
};