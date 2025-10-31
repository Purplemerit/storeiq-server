// server/src/controllers/imageGeneratorController.js
//
// Image generation using Google Gemini Imagen 3
// Migrated from Stability AI to Gemini Imagen 3 for better integration
//
// Required Environment Variables:
// - GEMINI_API_KEY: Your Google Gemini API key
//
// API Documentation:
// https://ai.google.dev/gemini-api/docs/imagen

const axios = require('axios');
const s3Service = require('../s3Service');

/**
 * POST /api/ai/generate-image
 * Body: { prompt: string }
 * Authenticated user context required (req.user)
 *
 * Generates an image using Google Gemini Imagen 3 model
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

    // Call Gemini Imagen API
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Use Gemini Imagen 3 model for image generation
    // Model: imagen-3.0-generate-002 (Imagen 3 Fast)
    const imagenModel = "imagen-3.0-generate-002";
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${imagenModel}:predict`;

    console.log('Generating image with Gemini Imagen 3...');
    const geminiResponse = await axios.post(
      geminiApiUrl,
      {
        instances: [
          {
            prompt: prompt
          }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
          safetyFilterLevel: "block_some",
          personGeneration: "allow_adult"
        }
      },
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
      return res.status(502).json({ error: 'Image generation failed - no predictions returned' });
    }

    // Extract the base64 image from the response
    // Gemini returns images in base64 format in predictions[0].bytesBase64Encoded
    const imageBase64 = predictions[0].bytesBase64Encoded;
    if (!imageBase64) {
      console.error('No bytesBase64Encoded in response:', predictions[0]);
      return res.status(502).json({ error: 'Image generation failed - no image data returned' });
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const fileName = `generated/${user.id || user._id || 'user'}/${Date.now()}-image.png`;

    // Upload to S3 using existing service
    const userId = user.id || user._id;
    const username = user.username || userId;
    const s3Result = await s3Service.uploadImageBuffer(
      imageBuffer,
      'image/png',
      userId,
      username,
      { generated: "true", prompt }
    );
    if (!s3Result || !s3Result.url) {
      return res.status(502).json({ error: 'Failed to upload image to S3' });
    }

    // Respond with metadata
    return res.json({
      imageUrl: s3Result.url,
      url: s3Result.url,
      s3Key: s3Result.key,
      prompt,
      userId,
      fileName,
      createdAt: new Date().toISOString(),
      provider: 'gemini-imagen-3',
    });
  } catch (err) {
    console.error('Image generation error:', err.response?.data || err.message);

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
  generateImage,
};