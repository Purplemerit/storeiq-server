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
    const username = req.user && req.user.username ? req.user.username : null;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required to upload video' });
    }
    const videoUrl = await uploadVideoBase64(videoResult, userId, username, {});
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
  const userId = req.user && req.user._id ? req.user._id.toString() : null;
  const username = req.user && req.user.username ? req.user.username : null;
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  try {
    // List all videos in S3 for this user
    const videos = await listUserVideosFromS3(userId, username || '');
  // Fetch all MongoDB video records for this user
  const Video = require('../models/Video');
  const mongoVideos = await Video.find({ owner: userId });
    // For each video, generate a signed URL and merge MongoDB metadata if available
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const REGION = process.env.AWS_REGION || 'ap-south-1';
    const S3_BUCKET = process.env.AWS_S3_BUCKET || 'store-iq-bucket';
    const s3 = new S3Client({ region: REGION });

    const formatted = await Promise.all(
      (Array.isArray(videos) ? videos : []).map(async v => {
        let signedUrl = null;
        try {
          const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: v.key });
          signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        } catch (e) {
          signedUrl = v.s3Url; // fallback to public S3 URL if signing fails
        }
        // Find MongoDB metadata for this s3Key
        const meta = mongoVideos.find(mv => mv.s3Key === v.key);
        return {
          id: v.key,
          s3Key: v.key,
          title: meta && meta.title ? meta.title : v.title,
          description: meta && meta.description ? meta.description : '',
          url: signedUrl,
          createdAt: meta && meta.createdAt ? meta.createdAt : v.createdAt,
          thumbnail: v.thumbnail || null,
          isEdited: v.isEdited || false,
          publishCount: meta && typeof meta.publishCount === 'number' ? meta.publishCount : 0,
          publishedToYouTube: meta && typeof meta.publishedToYouTube === 'boolean' ? meta.publishedToYouTube : false,
        };
      })
    );
    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch user videos' });
  }
}

module.exports = {
  handleGenerateScript,
  handleGenerateVideo,
  getUserVideos,
};