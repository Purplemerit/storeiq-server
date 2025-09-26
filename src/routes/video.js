const express = require('express');
const { deleteVideoFromS3, uploadVideoBase64, uploadVideoBuffer } = require('../s3Service');
const { generateVideo } = require('../geminiService');
const { getUserVideos } = require('../controllers/aiController');
const authMiddleware = require('./authMiddleware');
const multer = require('multer');
const { listUserImagesFromS3 } = require('../s3Service');

const router = express.Router();
const {
  createJob,
  getJob
} = require('../videoEditJob');

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

  // Enforce user-level access: s3Key must start with userId
  const username = req.user && req.user.username ? req.user.username : null;
  const expectedPrefix = username ? `videos/${username}/` : userId;
  if (!s3Key.startsWith(expectedPrefix)) {
    return res.status(403).json({ error: 'Unauthorized: You do not have permission to delete this video.' });
  }
  try {
    await deleteVideoFromS3(s3Key);

    // Also delete the videoEditJob from MongoDB
    try {
      const { deleteJobByS3Key } = require('../videoEditJob');
      await deleteJobByS3Key(s3Key);
    } catch (err) {
      console.error('[DELETE-VIDEO] Error deleting videoEditJob:', err);
    }

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
    const username = req.user && req.user.username ? req.user.username : null;
    if (result && typeof result === 'string' && isBase64(result)) {
      s3Url = await uploadVideoBase64(result, userId, username, {});
    } else if (result && result.base64) {
      s3Url = await uploadVideoBase64(result.base64, userId, username, {});
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
      const username = req.user && req.user.username ? req.user.username : null;
      const { url, key } = await uploadVideoBuffer(buffer, mimetype, userId, username, {});
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

// GET /api/images - List all images for the authenticated user
router.get('/images', authMiddleware, async (req, res) => {
  try {
    const userId = req.user && req.user._id ? req.user._id.toString() : null;
    const username = req.user && req.user.username ? req.user.username : null;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }
    const images = await listUserImagesFromS3(userId, username);
    res.json(Array.isArray(images) ? images : []);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch images' });
  }
});

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

/**
 * POST /api/video/crop
 * Body: { videoUrl (or s3Key), start, end }
 * Returns: { jobId, status }
 */
const User = require('../models/User');

router.post('/video/crop', authMiddleware, async (req, res) => {
  const { videoUrl, s3Key, start, end } = req.body;
  // Extract userId from authenticated user
  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  let username = req.user && req.user.username ? req.user.username : null;

  // If username is missing, fetch from DB
  if (!username && userId) {
    try {
      const userDoc = await User.findById(userId).select('username');
      if (userDoc && userDoc.username) {
        username = userDoc.username;
      }
    } catch (e) {
      console.error('[VIDEO-CROP][API] Failed to fetch username from DB:', e);
    }
  }

  console.log('[VIDEO-CROP][API] Incoming crop request:', {
    videoUrl, s3Key, start, end, userId, username,
    reqUser: req.user
  });
  
  // Debug log to confirm username is present in crop job data
  console.log('[VIDEO-CROP][API] Crop job data before creation:', {
    type: 'crop',
    videoUrl,
    s3Key,
    start,
    end,
    userId,
    username
  });
  
  if ((!videoUrl && !s3Key) || typeof start !== 'number' || typeof end !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid videoUrl/s3Key, start, or end' });
  }
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }
  try {
    const job = await createJob({
      type: 'crop',
      videoUrl,
      s3Key,
      start,
      end,
      userId,
      username
    });
    console.log(`[VIDEO-CROP][API] Created crop job:`, {
      jobId: job.jobId,
      videoUrl: job.videoUrl,
      s3Key: job.s3Key,
      start: job.start,
      end: job.end,
      userId: job.userId,
      username: job.username,
      status: job.status
    });
    res.json({ jobId: job.jobId, status: job.status });
  } catch (err) {
    console.error('[VIDEO-CROP][API] Failed to create crop job:', err);
    res.status(500).json({ error: err.message || 'Failed to create crop job' });
  }
});

/**
 * GET /api/video/crop/:job_id
 * Returns: { jobId, status, error, downloadUrl }
 */
router.get('/video/crop/:job_id', async (req, res) => {
  const { job_id } = req.params;
  const job = await getJob(job_id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    jobId: job.jobId,
    status: job.status,
    error: job.error,
    downloadUrl: job.downloadUrl,
    key: job.key || job.s3Key || null
  });
});

module.exports = router;
