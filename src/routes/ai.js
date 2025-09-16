const express = require('express');
const { handleGenerateScript, handleGenerateVideo } = require('../controllers/aiController');

const router = express.Router();

router.post('/generate-script', handleGenerateScript);
router.post('/generate-video', handleGenerateVideo);

module.exports = router;