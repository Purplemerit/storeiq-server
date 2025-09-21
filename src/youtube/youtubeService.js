const axios = require('axios');
const API_KEY = process.env.YOUTUBE_API_KEY;

async function searchVideos(query, fromDate, toDate, order, maxResults=20) {
  const res = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    params: {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults,
      order,
      publishedAfter: fromDate,
      publishedBefore: toDate,
      key: API_KEY
    }
  });
  return res.data.items;
}

async function getVideoStats(videoIds) {
  const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: {
      part: 'statistics,snippet',
      id: videoIds.join(','),
      key: API_KEY
    }
  });
  return res.data.items;
}

module.exports = { searchVideos, getVideoStats };
