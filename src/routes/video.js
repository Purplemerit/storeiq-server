const express = require('express');
const { deleteVideoFromS3 } = require('../s3Service');

const router = express.Router();

/**
 * DELETE /api/delete-video
 * Body: { key: string }
 */
router.delete('/delete-video', async (req, res) => {
  const { s3Key } = req.body;
  if (!s3Key || typeof s3Key !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid S3 key' });
  }
  try {
    await deleteVideoFromS3(s3Key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video from S3' });
  }
});
/**
 * POST /api/generate-video
 * Body: { script: string, config: object }
 */
const { generateVideo } = require('../geminiService');
const { uploadVideoBase64 } = require('../s3Service');
const isBase64 = str => typeof str === 'string' && /^([A-Za-z0-9+/=]+\s*)+$/.test(str.replace(/^data:video\/mp4;base64,/, ''));

router.post('/generate-video', async (req, res) => {
  const { script, config } = req.body;
  if (typeof script !== 'string' || !config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid script/config' });
  }
  try {
    const result = await generateVideo(script, config);

    // Handle both real and mock/demo video cases
    let s3Url = null;
    if (result && typeof result === 'string' && isBase64(result)) {
      // Real video (base64 string)
      s3Url = await uploadVideoBase64(result);
    } else if (result && result.base64) {
      // If result is an object with a base64 property
      s3Url = await uploadVideoBase64(result.base64);
    }

    // Return S3 URL if uploaded, else fallback to result
    res.json({
      success: true,
      s3Url,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate video' });
  }
});

/**
 * POST /api/upload-video
 * Accepts a video file upload via multipart/form-data, uploads to S3, returns S3 URL and key.
 */
const multer = require('multer');
const upload = multer();

const { uploadVideoBuffer } = require('../s3Service');

router.post('/upload-video', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }
  const { buffer, mimetype } = req.file;
  try {
    const { url, key } = await uploadVideoBuffer(buffer, mimetype);
    res.json({ success: true, videoUrl: url, s3Key: key });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

module.exports = router;