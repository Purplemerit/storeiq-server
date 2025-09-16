const express = require('express');
const { deleteVideoFromS3 } = require('../s3Service');

const router = express.Router();

/**
 * DELETE /api/delete-video
 * Body: { key: string }
 */
router.delete('/delete-video', async (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid S3 key' });
  }
  try {
    await deleteVideoFromS3(key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video from S3' });
  }
});

module.exports = router;