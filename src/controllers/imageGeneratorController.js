// server/src/controllers/imageGeneratorController.js

const axios = require('axios');
const s3Service = require('../s3Service');

/**
 * POST /generate-image
 * Body: { prompt: string }
 * Authenticated user context required (req.user)
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

    // Call Stability AI API
    const stabilityApiKey = process.env.STABILITY_API_KEY;
    if (!stabilityApiKey) {
      return res.status(500).json({ error: 'Stability API key not configured' });
    }

    // Use Stability AI engine ID and endpoint as per latest docs
    const engineId = "stable-diffusion-xl-1024-v1-0";
    const stabilityApiUrl = `https://api.stability.ai/v1/generation/${engineId}/text-to-image`;

    const stabilityResponse = await axios.post(
      stabilityApiUrl,
      {
        text_prompts: [{ text: prompt }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        samples: 1,
        steps: 30,
      },
      {
        headers: {
          'Authorization': `Bearer ${stabilityApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }
    );

    // The API returns base64-encoded image(s)
    const images = stabilityResponse.data.artifacts;
    if (!images || !images.length || !images[0].base64) {
      return res.status(502).json({ error: 'Image generation failed' });
    }

    const imageBase64 = images[0].base64;
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const fileName = `generated/${user.id || user._id || 'user'}/${Date.now()}-image.png`;

    // Upload to S3 using existing service
    // Use uploadVideoBuffer for images as well (it handles buffer uploads)
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
      provider: 'stability-ai',
    });
  } catch (err) {
    console.error('Image generation error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  generateImage,
};