const express = require('express');
const { deleteVideoFromS3, uploadVideoBase64, uploadVideoBuffer } = require('../s3Service');
const { generateVideo } = require('../geminiService');
const { getUserVideos } = require('../controllers/aiController');
const authMiddleware = require('./authMiddleware');
const multer = require('multer');

const router = express.Router();

/**
 * DELETE /api/delete-video
 * Body: { s3Key: string }
 */
router.delete('/delete-video', authMiddleware, async (req, res) => {
  const { s3Key } = req.body;

  if (!s3Key || typeof s3Key !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid S3 key' });
  }

  // Ensure user is authenticated
  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required to delete video' });
  }

  try {
    await deleteVideoFromS3(s3Key);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE-VIDEO] Error deleting from S3:', err);
    res.status(500).json({ error: 'Failed to delete video from S3' });
  }
});

/**
 * POST /api/generate-video
 * Body: { script: string, config: object }
 */
const isBase64 = str =>
  typeof str === 'string' &&
  /^([A-Za-z0-9+/=]+\s*)+$/.test(str.replace(/^data:video\/mp4;base64,/, ''));

router.post('/generate-video', authMiddleware, async (req, res) => {
  const { script, config } = req.body;

  if (typeof script !== 'string' || !config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid script/config' });
  }

  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required to generate video' });
  }

  try {
    const result = await generateVideo(script, config);

    let s3Url = null;
    if (result && typeof result === 'string' && isBase64(result)) {
      s3Url = await uploadVideoBase64(result, userId);   // ✅ pass userId
    } else if (result && result.base64) {
      s3Url = await uploadVideoBase64(result.base64, userId);  // ✅ pass userId
    }

    res.json({
      success: true,
      s3Url,
      data: result,
    });
  } catch (err) {
    console.error('[GENERATE-VIDEO] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate video' });
  }
});

/**
 * POST /api/upload-video
 * Accepts a video file upload via multipart/form-data, uploads to S3, returns S3 URL and key.
 */
const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

router.post(
  '/upload-video',
  authMiddleware,
  upload.single('video'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const userId = req.user && req.user._id ? req.user._id.toString() : null;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required to upload video' });
    }

    const { buffer, mimetype } = req.file;

    try {
      const { url, key } = await uploadVideoBuffer(buffer, mimetype, userId);
      res.json({ success: true, videoUrl: url, s3Key: key });
    } catch (err) {
      console.error('[UPLOAD-VIDEO] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to upload video' });
    }
  }
);

// Multer error handling middleware for upload-video
router.use('/upload-video', (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum allowed size is 100MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(500).json({ error: err.message || 'Unknown upload error' });
  }
  next();
});

/**
 * GET /api/videos?userId=...
 * Returns all videos for a user.
 */
router.get('/videos', authMiddleware, getUserVideos);

module.exports = router;
