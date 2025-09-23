const { searchVideos, getVideoStats } = require('./youtubeService');

async function fetchYouTube(req, res) {
  try {
    const { query, from, to, order } = req.body;
    const searchResults = await searchVideos(query, from, to, order);
    const videoIds = searchResults.map(video => video.id.videoId);
    const videosWithStats = await getVideoStats(videoIds);
    res.json(videosWithStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { fetchYouTube };
