const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const schedulingService = require('../services/schedulingService');

// POST /api/schedule/video - Schedule a video for publishing
router.post('/video', authMiddleware, async (req, res) => {
  try {
    const { videoS3Key, scheduledTime, timezone = 'UTC', metadata = {} } = req.body;

    // Validate required fields
    if (!videoS3Key || !scheduledTime) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: {
          videoS3Key: !videoS3Key ? 'Video S3 key is required' : undefined,
          scheduledTime: !scheduledTime ? 'Scheduled time is required' : undefined
        }
      });
    }

    // Create scheduled post
    const scheduledPost = await schedulingService.createScheduledPost(
      req.user._id, // Changed from req.user.id to req.user._id
      videoS3Key,
      scheduledTime,
      timezone,
      metadata
    );

    return res.status(200).json({
      success: true,
      data: scheduledPost
    });
  } catch (error) {
    console.error('Scheduling error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// GET /api/schedule/video - Get all scheduled posts for a user
router.get('/video', authMiddleware, async (req, res) => {
  try {
    const scheduledPosts = await schedulingService.getScheduledPosts(req.user._id);
    res.json(scheduledPosts);
  } catch (error) {
    console.error('Get scheduled posts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/schedule/video/:id - Delete a scheduled post
router.delete('/video/:id', authMiddleware, async (req, res) => {
  try {
    const result = await schedulingService.deleteScheduledPost(req.user._id, req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Delete scheduled post error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;