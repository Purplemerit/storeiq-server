// AI Controllers for script and video generation
const { generateScript, generateVideo } = require('../geminiService');
const { uploadVideoBase64 } = require('../s3Service');

// POST /api/generate-script
async function handleGenerateScript(req, res) {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt' });
    }
    const script = await generateScript(prompt);
    res.status(200).json({ script });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

// POST /api/generate-video
async function handleGenerateVideo(req, res) {
  try {
    const { script, videoConfig } = req.body;
    if (!script || typeof script !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid script' });
    }
    // Generate video (base64) from Gemini Veo-3
    const videoResult = await generateVideo(script, videoConfig);

    // If Veo-3 is unavailable, return mock video URL and message
    if (videoResult && videoResult.mock) {
      return res.status(404).json({
        error: videoResult.message || 'Veo-3 video generation is unavailable.',
      });
    }

    // Upload generated video to S3
    const userId = req.user && req.user._id ? req.user._id.toString() : null;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required to upload video' });
    }
    const videoUrl = await uploadVideoBase64(videoResult, userId);
    res.status(200).json({ videoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

/**
 * GET /api/videos?userId=...
 * Returns all videos for a user.
 */
const { listUserVideosFromS3 } = require('../s3Service');
async function getUserVideos(req, res) {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId query parameter' });
  }
  try {
    const videos = await listUserVideosFromS3(userId);
    // Ensure each object has required fields and thumbnail (null if not available)
    const formatted = videos.map(v => ({
      title: v.title,
      s3Url: v.s3Url,
      url: v.s3Url, // For frontend compatibility
      createdAt: v.createdAt,
      thumbnail: v.thumbnail || null, // Add logic here if thumbnails are stored with a convention
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch user videos' });
  }
}

module.exports = {
  handleGenerateScript,
  handleGenerateVideo,
  getUserVideos,
};