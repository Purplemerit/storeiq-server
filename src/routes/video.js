const express = require('express');
const { deleteVideoFromS3 } = require('../s3Service');

const router = express.Router();
const authMiddleware = require('./authMiddleware');

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
const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

const { uploadVideoBuffer } = require('../s3Service');

// Logging wrapper for authMiddleware
function logAuthMiddleware(req, res, next) {
  console.log('[UPLOAD-VIDEO] Entering authMiddleware');
  authMiddleware(req, res, function(err) {
    if (err) {
      console.error('[UPLOAD-VIDEO] Error in authMiddleware:', err);
      return next(err);
    }
    console.log('[UPLOAD-VIDEO] Exiting authMiddleware');
    next();
  });
}

// Logging wrapper for multer
function logMulterSingle(fieldName) {
  const mw = upload.single(fieldName);
  return function(req, res, next) {
    console.log(`[UPLOAD-VIDEO] Entering multer.single('${fieldName}')`);
    mw(req, res, function(err) {
      if (err) {
        console.error(`[UPLOAD-VIDEO] Error in multer.single('${fieldName}'):`, err);
        return next(err);
      }
      // Log the field name received from frontend
      if (req.file) {
        console.log(`[UPLOAD-VIDEO] multer.single received file field: ${req.file.fieldname}`);
      } else {
        console.log('[UPLOAD-VIDEO] multer.single did not receive a file');
      }
      console.log(`[UPLOAD-VIDEO] Exiting multer.single('${fieldName}')`);
      next();
    });
  };
}

router.post(
  '/upload-video',
  authMiddleware,
  upload.single('video'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    // Extract userId from authenticated user
    const userId = req.user && req.user._id ? req.user._id.toString() : null;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required to upload video' });
    }
    const { buffer, mimetype, originalname, fieldname } = req.file;
    try {
      const { url, key } = await uploadVideoBuffer(buffer, mimetype, userId);
      res.json({ success: true, videoUrl: url, s3Key: key });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to upload video' });
    }
  }
);

// Multer error handling middleware for upload-video
router.use('/upload-video', (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors (e.g., file too large)
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum allowed size is 100MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  } else if (err) {
    // Other errors
    return res.status(500).json({ error: err.message || 'Unknown upload error' });
  }
  next();
});

/**
 * GET /api/videos?userId=...
 * Returns all videos for a user.
 */
const { getUserVideos } = require('../controllers/aiController');
router.get('/videos', getUserVideos);

/**
 * POST /api/s3-presigned-url
 * Body: { filename: string, contentType: string }
 * Returns: { url, key }
 */
const { generatePresignedUrl } = require('../s3Service');
router.post('/s3-presigned-url', authMiddleware, async (req, res) => {
  const { filename, contentType } = req.body;
  // Extract userId from authenticated user
  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'Missing filename or contentType' });
  }
  try {
    const { url, fileUrl, key } = await generatePresignedUrl(filename, contentType, userId);
    res.json({ url, fileUrl, s3Key: key });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate presigned URL' });
  }
});

/**
 * S3 Multipart Upload Endpoints
 */
const {
  initiateMultipartUpload,
  generateMultipartPresignedUrls,
  completeMultipartUpload,
  abortMultipartUpload,
} = require('../s3Service');

/**
 * POST /api/s3-multipart/initiate
 * Body: { filename, contentType }
 * Returns: { uploadId, key }
 */
router.post('/s3-multipart/initiate', authMiddleware, async (req, res) => {
  const { filename, contentType } = req.body;
  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  if (!userId) return res.status(401).json({ error: 'User authentication required' });
  if (!filename || !contentType) return res.status(400).json({ error: 'Missing filename or contentType' });
  try {
    const { uploadId, key } = await initiateMultipartUpload(filename, contentType, userId);
    res.json({ uploadId, key });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to initiate multipart upload' });
  }
});

/**
 * POST /api/s3-multipart/presigned-urls
 * Body: { key, uploadId, partNumbers: [int], contentType }
 * Returns: { urls: [{ partNumber, url }] }
 */
router.post('/s3-multipart/presigned-urls', authMiddleware, async (req, res) => {
  const { key, uploadId, partNumbers, contentType } = req.body;
  if (!key || !uploadId || !Array.isArray(partNumbers) || !contentType) {
    return res.status(400).json({ error: 'Missing key, uploadId, partNumbers, or contentType' });
  }
  try {
    const urls = await generateMultipartPresignedUrls(key, uploadId, partNumbers, contentType);
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate presigned URLs' });
  }
});

/**
 * POST /api/s3-multipart/complete
 * Body: { key, uploadId, parts: [{ ETag, PartNumber }] }
 * Returns: { fileUrl }
 */
router.post('/s3-multipart/complete', authMiddleware, async (req, res) => {
  const { key, uploadId, parts } = req.body;
  if (!key || !uploadId || !Array.isArray(parts)) {
    return res.status(400).json({ error: 'Missing key, uploadId, or parts' });
  }
  try {
    const { fileUrl } = await completeMultipartUpload(key, uploadId, parts);
    res.json({ fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to complete multipart upload' });
  }
});

/**
 * POST /api/s3-multipart/abort
 * Body: { key, uploadId }
 * Returns: { success: true }
 */
router.post('/s3-multipart/abort', authMiddleware, async (req, res) => {
  const { key, uploadId } = req.body;
  if (!key || !uploadId) {
    return res.status(400).json({ error: 'Missing key or uploadId' });
  }
  try {
    await abortMultipartUpload(key, uploadId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to abort multipart upload' });
  }
});

module.exports = router;