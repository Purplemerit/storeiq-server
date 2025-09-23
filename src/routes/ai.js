const express = require('express');
const { handleGenerateScript, handleGenerateVideo } = require('../controllers/aiController');
const { generateImage } = require('../controllers/imageGeneratorController');
const authMiddleware = require('./authMiddleware');

const router = express.Router();

router.post('/generate-script', handleGenerateScript);
router.post('/generate-video', handleGenerateVideo);

router.post('/generate-image', authMiddleware, generateImage);

module.exports = router;