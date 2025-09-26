// server/src/controllers/imageEditController.js

const axios = require('axios');
const s3Service = require('../s3Service');
const { FormData, File } = require('formdata-node');
const sharp = require('sharp');

/**
 * POST /api/ai/edit-image
 * Accepts: image (required), mask (optional), prompt (required)
 * Authenticated user context required (req.user)
 * Multer middleware must provide req.files and req.body
 */
async function editImage(req, res) {
  try {
    const user = req.user;
    const { prompt } = req.body;
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

    // Validate and resize image dimensions using sharp
    let resizedNote = null;
    try {
      const metadata = await sharp(imageFile.buffer).metadata();
      const allowedSizes = [
        [1024, 1024],
        [1152, 896],
        [1216, 832],
        [1344, 768],
        [1536, 640],
        [640, 1536],
        [768, 1344],
        [832, 1216],
        [896, 1152],
      ];
      const isAllowed = allowedSizes.some(
        ([w, h]) => (metadata.width === w && metadata.height === h)
      );
      if (!isAllowed) {
        // Find the closest allowed size by Euclidean distance
        const distances = allowedSizes.map(
          ([w, h]) => ({
            size: [w, h],
            dist: Math.sqrt(Math.pow(metadata.width - w, 2) + Math.pow(metadata.height - h, 2))
          })
        );
        distances.sort((a, b) => a.dist - b.dist);
        const [targetW, targetH] = distances[0].size;
        const resizedBuffer = await sharp(imageFile.buffer)
          .resize(targetW, targetH, { fit: 'fill' })
          .toBuffer();
        imageFile.buffer = resizedBuffer;
        resizedNote = `Image was automatically resized from ${metadata.width}x${metadata.height} to ${targetW}x${targetH} to match allowed SDXL sizes.`;
        // Optionally, you can log this event
        console.log(resizedNote);
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid image file or unable to read image dimensions.' });
    }

    const stabilityApiKey = process.env.STABILITY_API_KEY;
    if (!stabilityApiKey) {
      return res.status(500).json({ error: 'Stability API key not configured' });
    }

    // Choose endpoint and form data based on presence of mask
    const engineId = "stable-diffusion-xl-1024-v1-0";
    let stabilityApiUrl, formData, headers;

    if (maskFile) {
      // Inpainting endpoint
      stabilityApiUrl = `https://api.stability.ai/v1/generation/${engineId}/image-to-image/masking`;
      formData = new FormData();
      formData.append(
        'init_image',
        new File([imageFile.buffer], imageFile.originalname, { type: imageFile.mimetype }),
      );
      formData.append(
        'mask_image',
        new File([maskFile.buffer], maskFile.originalname, { type: maskFile.mimetype }),
      );
      formData.append('text_prompts[0][text]', prompt);
      formData.append('cfg_scale', '7');
      formData.append('samples', '1');
      formData.append('steps', '30');
      headers = {
        ...formData.headers,
        'Authorization': `Bearer ${stabilityApiKey}`,
        'Accept': 'application/json',
      };
    } else {
      // Image-to-image endpoint
      stabilityApiUrl = `https://api.stability.ai/v1/generation/${engineId}/image-to-image`;
      formData = new FormData();
      formData.append(
        'init_image',
        new File([imageFile.buffer], imageFile.originalname, { type: imageFile.mimetype }),
      );
      formData.append('text_prompts[0][text]', prompt);
      formData.append('cfg_scale', '7');
      formData.append('samples', '1');
      formData.append('steps', '30');
      headers = {
        ...formData.headers,
        'Authorization': `Bearer ${stabilityApiKey}`,
        'Accept': 'application/json',
      };
    }

    const stabilityResponse = await axios.post(
      stabilityApiUrl,
      formData,
      { headers }
    );

    const images = stabilityResponse.data.artifacts;
    if (!images || !images.length || !images[0].base64) {
      return res.status(502).json({ error: 'Image editing failed' });
    }

    const imageBase64 = images[0].base64;
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
      provider: 'stability-ai',
      editType: maskFile ? 'inpainting' : 'image-to-image',
      ...(resizedNote ? { resizeNote: resizedNote } : {}),
    });
  } catch (err) {
    console.error('Image edit error:', err?.response?.data || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  editImage,
};