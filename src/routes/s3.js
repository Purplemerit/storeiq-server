const express = require('express');
const { generatePresignedUrl } = require('../s3Service');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const authMiddleware = require('./authMiddleware');
const router = express.Router();

// POST /api/s3/generate-upload-url
router.post('/generate-upload-url', authMiddleware, async (req, res) => {
  try {
    console.log('[s3] Generate upload URL request:', {
      hasUser: !!req.user,
      userId: req.user?.id || req.user?._id,
      filename: req.body?.filename
    });
    
    const { filename, contentType } = req.body;
    const userId = req.user.id || req.user._id;
    const username = req.user.username;
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }
    const { url, key } = await generatePresignedUrl(filename, contentType, userId, username);
    res.json({ uploadUrl: url, key });
  } catch (err) {
    console.error('[s3] Generate upload URL error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate upload URL' });
  }
});

// GET /api/s3/generate-download-url?key=...
router.get('/generate-download-url', authMiddleware, async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key is required' });
    // Optionally: check if user owns the file by key prefix
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    const command = new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ downloadUrl: url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate download URL' });
  }
});

module.exports = router;
