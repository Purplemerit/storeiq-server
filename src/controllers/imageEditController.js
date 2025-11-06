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
const { GoogleAuth } = require('google-auth-library');

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
 * Edits an image using Google Imagen 3 via Vertex AI
 * Uses REFERENCE_TYPE_RAW for instruct-based editing
 * Returns the edited image URL after uploading to S3
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

    // Get Google Cloud credentials
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      return res.status(500).json({ error: 'Google Cloud project not configured' });
    }

    // Fetch image from S3
    let imageBuffer;
    try {
      imageBuffer = await s3Service.getFileBuffer(imageS3Key);
    } catch (err) {
      console.error('Failed to fetch image from S3:', err);
      return res.status(400).json({ error: 'Failed to fetch image from S3' });
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
    const imageBase64 = imageBuffer.toString('base64');

    // Use Imagen 3 model for image editing with instruct customization
    // imagegeneration@006 supports both generation and editing with edit mode
    const imagenModel = "imagegeneration@006";
    const location = "us-central1";
    const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}:predict`;

    console.log('Editing image with Imagen 3...');
    console.log('Prompt:', prompt);

    // Build request for image editing with base image
    // Using edit mode with prompt-based instructions
    const requestBody = {
      instances: [
        {
          prompt: prompt,
          image: {
            bytesBase64Encoded: imageBase64
          }
        }
      ],
      parameters: {
        sampleCount: 1,
        mode: "edit", // Explicitly set edit mode
        editMode: "inpainting-insert" // Use inpainting for general edits
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

    console.log('Vertex AI API response received');

    // Extract the generated image from the response
    const predictions = vertexResponse.data.predictions;
    if (!predictions || !predictions.length) {
      console.error('No predictions in response:', vertexResponse.data);
      return res.status(502).json({ error: 'Image editing failed - no predictions returned' });
    }

    // Extract base64 image from predictions
    const imageBase64Output = predictions[0].bytesBase64Encoded;
    if (!imageBase64Output) {
      console.error('No bytesBase64Encoded in response:', predictions[0]);
      return res.status(502).json({ error: 'Image editing failed - no image data returned' });
    }

    const editedImageBuffer = Buffer.from(imageBase64Output, 'base64');
    
    // Generate meaningful filename from prompt (short version for file system)
    const meaningfulFilename = generateMeaningfulFilename(prompt);
    
    // Generate short, user-friendly title for display
    const shortTitle = generateShortTitle(prompt);
    
    const userId = user.id || user._id;
    const username = user.username || userId;

    // Upload edited image to S3
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
      return res.status(502).json({ error: 'Failed to upload edited image to S3' });
    }

    // Save to database (same as image generation)
    const Video = require('../models/Video');
    let videoRecord = await Video.findOne({ s3Key: s3Result.key });
    if (!videoRecord) {
      videoRecord = new Video({
        s3Key: s3Result.key,
        owner: userId,
        title: shortTitle, // Use short title instead of filename
        description: `Edited: ${prompt}`,
        prompt: prompt,
        provider: 'vertex-ai-imagen-3',
      });
      await videoRecord.save();
      console.log('Edited image metadata saved to database');
    }

    // Generate signed download URL
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    const getCommand = new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Result.key });
    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    return res.json({
      imageUrl: signedUrl,
      url: signedUrl,
      s3Key: s3Result.key,
      prompt,
      userId,
      title: shortTitle, // Return short title to frontend
      createdAt: new Date().toISOString(),
      provider: 'vertex-ai-imagen-3',
      editType: 'instruct-editing',
      model: 'imagen-3.0-capability-002',
    });
  } catch (err) {
    console.error('Image edit error:', err?.response?.data || err.message);

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
      error: 'Internal server error',
      details: err.message
    });
  }
}

module.exports = {
  editImage,
};