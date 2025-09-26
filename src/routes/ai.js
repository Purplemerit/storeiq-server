const express = require('express');
const multer = require('multer');
const { handleGenerateScript, handleGenerateVideo } = require('../controllers/aiController');
const { generateImage } = require('../controllers/imageGeneratorController');
const { editImage } = require('../controllers/imageEditController');
const authMiddleware = require('./authMiddleware');

const router = express.Router();

// Multer memory storage for image editing
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/generate-script', handleGenerateScript);
router.post('/generate-video', handleGenerateVideo);

router.post('/generate-image', authMiddleware, generateImage);

// POST /api/ai/edit-image
// Accepts multipart/form-data: image (required), mask (optional), prompt (required)
router.post(
  '/edit-image',
  authMiddleware,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mask', maxCount: 1 }
  ]),
  editImage
);

module.exports = router;