const express = require('express');
const { fetchYouTube } = require('./youtubeController');
const router = express.Router();

router.post('/search', fetchYouTube);

module.exports = router;
