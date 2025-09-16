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
    const videoUrl = await uploadVideoBase64(videoResult);
    res.status(200).json({ videoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

module.exports = {
  handleGenerateScript,
  handleGenerateVideo,
};