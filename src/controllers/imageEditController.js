// server/src/controllers/imageEditController.js
//
// Image editing using Google Gemini 2.5 Flash Image (aka "Nano Banana")
// Migrated from Stability AI to Gemini for better integration
//
// Required Environment Variables:
// - GEMINI_API_KEY: Your Google Gemini API key
//
// Model: gemini-2.5-flash-image
// Supports: Image editing, multi-turn editing, image composition
//
// API Documentation:
// https://ai.google.dev/gemini-api/docs/image-generation

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
    const user = req.user;
    const prompt = req.body?.prompt;
    const imageFile = req.files?.image?.[0];
    const maskFile = req.files?.mask?.[0];

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    if (!imageFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Call Gemini API with gemini-2.5-flash-image model
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Convert image to base64
    const imageBase64Input = imageFile.buffer.toString('base64');
    const imageMimeType = imageFile.mimetype || 'image/png';

    // Use Gemini 2.5 Flash Image model (supports image editing)
    const geminiModel = "gemini-2.5-flash-image";
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    console.log('Editing image with Gemini 2.5 Flash Image...');

    // Build the request with inline image data
    const parts = [
      {
        inline_data: {
          mime_type: imageMimeType,
          data: imageBase64Input
        }
      },
      {
        text: prompt
      }
    ];

    // If mask is provided, include it as well
    if (maskFile) {
      const maskBase64 = maskFile.buffer.toString('base64');
      const maskMimeType = maskFile.mimetype || 'image/png';
      parts.unshift({
        inline_data: {
          mime_type: maskMimeType,
          data: maskBase64
        }
      });
    }

    const requestBody = {
      contents: [
        {
          parts: parts
        }
      ],
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 1,
        maxOutputTokens: 4096
      }
    };

    const geminiResponse = await axios.post(
      geminiApiUrl,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json'
        },
      }
    );

    console.log('Gemini API response received');

    // Extract the generated image from the response
    const candidates = geminiResponse.data.candidates;
    if (!candidates || !candidates.length) {
      console.error('No candidates in response:', geminiResponse.data);
      return res.status(502).json({ error: 'Image editing failed - no candidates returned' });
    }

    // Find the image part in the response
    const content = candidates[0].content;
    const imagePart = content.parts?.find(part => part.inline_data?.mime_type?.startsWith('image/'));

    if (!imagePart || !imagePart.inline_data?.data) {
      console.error('No image data in response:', content);
      return res.status(502).json({ error: 'Image editing failed - no image data returned' });
    }

    const imageBase64 = imagePart.inline_data.data;
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
      provider: 'gemini-2.5-flash-image',
      editType: maskFile ? 'masked-editing' : 'image-editing',
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