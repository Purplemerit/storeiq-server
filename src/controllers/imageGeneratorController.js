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
 * Generates an image using Google Imagen 4 via Vertex AI
 * Returns the image URL after uploading to S3
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

    // Validate aspect ratio if provided
    const validAspectRatios = ['1:1', '9:16', '16:9', '4:3', '3:4'];
    const selectedAspectRatio = aspectRatio && validAspectRatios.includes(aspectRatio) 
      ? aspectRatio 
      : '1:1'; // Default to square

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
    console.log('Aspect ratio:', selectedAspectRatio);
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
          aspectRatio: selectedAspectRatio
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
    
    // Generate meaningful filename from prompt (short version for file system)
    const meaningfulFilename = generateMeaningfulFilename(prompt);
    
    // Generate short, user-friendly title for display
    const shortTitle = generateShortTitle(prompt);
    
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
        title: shortTitle, // Use short title instead of filename
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
      title: shortTitle, // Return short title to frontend
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