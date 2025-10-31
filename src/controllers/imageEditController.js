// server/src/controllers/imageEditController.js
//
// Image editing using Google Gemini Imagen 3
// Migrated from Stability AI to Gemini Imagen 3 for better integration
//
// Required Environment Variables:
// - GEMINI_API_KEY: Your Google Gemini API key
//
// API Documentation:
// https://ai.google.dev/gemini-api/docs/imagen

const axios = require('axios');
const s3Service = require('../s3Service');
const { FormData, File } = require('formdata-node');
const sharp = require('sharp');

/**
 * POST /api/ai/edit-image
 * Accepts: image (required), mask (optional), prompt (required)
 * Authenticated user context required (req.user)
 * Multer middleware must provide req.files and req.body
 *
 * Edits an image using Google Gemini Imagen 3 model
 * Returns the edited image URL after uploading to S3
 */
async function editImage(req, res) {
  try {
    console.log('[Image Edit] req.body:', req.body);
    console.log('[Image Edit] req.files:', req.files);

    const user = req.user;
    const prompt = req.body?.prompt;
    const imageFile = req.files?.image?.[0];
    const maskFile = req.files?.mask?.[0];

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: 'Prompt is required',
        debug: {
          bodyExists: !!req.body,
          promptValue: prompt,
          bodyKeys: req.body ? Object.keys(req.body) : []
        }
      });
    }
    if (!imageFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Call Gemini Imagen API
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Convert image to base64
    const imageBase64Input = imageFile.buffer.toString('base64');
    const imageMimeType = imageFile.mimetype || 'image/png';

    // Use Gemini Imagen 3 model for image editing
    // Model: imagen-3.0-generate-002 (Imagen 3 Fast)
    const imagenModel = "imagen-3.0-generate-002";
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${imagenModel}:predict`;

    console.log('Editing image with Gemini Imagen 3...');

    // Build request based on whether mask is provided
    const requestBody = {
      instances: [
        {
          prompt: prompt,
          image: {
            bytesBase64Encoded: imageBase64Input
          }
        }
      ],
      parameters: {
        sampleCount: 1,
        mode: maskFile ? "upscale" : "upscale", // Gemini uses upscale mode for editing
        safetyFilterLevel: "block_some",
        personGeneration: "allow_adult"
      }
    };

    // If mask is provided, add it to the request
    if (maskFile) {
      const maskBase64 = maskFile.buffer.toString('base64');
      requestBody.instances[0].mask = {
        bytesBase64Encoded: maskBase64
      };
    }

    const geminiResponse = await axios.post(
      geminiApiUrl,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey
        },
      }
    );

    console.log('Gemini API response received');

    // The API returns predictions array
    const predictions = geminiResponse.data.predictions;
    if (!predictions || !predictions.length) {
      console.error('No predictions in response:', geminiResponse.data);
      return res.status(502).json({ error: 'Image editing failed - no predictions returned' });
    }

    // Extract the base64 image from the response
    const imageBase64 = predictions[0].bytesBase64Encoded;
    if (!imageBase64) {
      console.error('No bytesBase64Encoded in response:', predictions[0]);
      return res.status(502).json({ error: 'Image editing failed - no image data returned' });
    }
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const userId = user.id || user._id;
    const username = user.username || userId;
    const fileName = `edited/${userId}/${Date.now()}-edited.png`;

    const s3Result = await s3Service.uploadImageBuffer(
      imageBuffer,
      'image/png',
      userId,
      username,
      { edited: "true", prompt }
    );
    if (!s3Result || !s3Result.url) {
      return res.status(502).json({ error: 'Failed to upload edited image to S3' });
    }

    return res.json({
      imageUrl: s3Result.url,
      url: s3Result.url,
      s3Key: s3Result.key,
      prompt,
      userId,
      fileName,
      createdAt: new Date().toISOString(),
      provider: 'gemini-imagen-3',
      editType: maskFile ? 'inpainting' : 'upscale',
    });
  } catch (err) {
    console.error('Image edit error:', err?.response?.data || err.message);

    // Provide more detailed error messages
    if (err.response?.status === 400) {
      return res.status(400).json({
        error: 'Invalid request to Gemini API',
        details: err.response?.data?.error?.message || 'Bad request'
      });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({
        error: 'Gemini API access denied',
        details: 'Check API key permissions and quota'
      });
    }
    if (err.response?.status === 404) {
      return res.status(404).json({
        error: 'Gemini Imagen model not found',
        details: 'The Imagen model may not be available for your API key'
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