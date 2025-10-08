const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./authMiddleware');
const schedulingService = require('../services/schedulingService');
const youtubeService = require('../youtube/youtubeService');

// POST /api/schedule/video
router.post('/video', authenticateToken, async (req, res) => {
  try {
    const { videoS3Key, scheduledTime, timezone } = req.body;

    // Validate required fields
    if (!videoS3Key || !scheduledTime || !timezone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify YouTube connection
    const isConnected = await youtubeService.verifyConnection(req.user.id);
    if (!isConnected) {
      return res.status(400).json({ error: 'YouTube account not connected' });
    }

    const scheduledPost = await schedulingService.createScheduledPost(
      req.user.id,
      videoS3Key,
      scheduledTime,
      timezone
    );

    res.status(201).json(scheduledPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/schedule/video
router.get('/video', authenticateToken, async (req, res) => {
  try {
    const scheduledPosts = await schedulingService.getScheduledPosts(req.user.id);
    res.json(scheduledPosts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/schedule/video/:id
router.delete('/video/:id', authenticateToken, async (req, res) => {
  try {
    const result = await schedulingService.deleteScheduledPost(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;