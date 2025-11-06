const express = require('express');
const multer = require('multer');
const { handleGenerateScript, handleGenerateVideo } = require('../controllers/aiController');
const { generateImage } = require('../controllers/imageGeneratorController');
const { editImage } = require('../controllers/imageEditController');
const authMiddleware = require('./authMiddleware');

const router = express.Router();

// Multer memory storage for image editing with increased size limit
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for image uploads
  }
});

// Multer error handler
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('[Multer Error]:', err);
    return res.status(400).json({
      error: 'File upload error',
      details: err.message,
      code: err.code
    });
  } else if (err) {
    console.error('[Upload Error]:', err);
    return res.status(500).json({ error: 'Upload failed', details: err.message });
  }
  next();
};

router.post('/generate-script', handleGenerateScript);
router.post('/generate-video', handleGenerateVideo);

router.post('/generate-image', authMiddleware, generateImage);

// POST /api/ai/edit-image
// Accepts JSON: { prompt: string, imageS3Key: string }
// No longer uses multer - image is uploaded to S3 first, then S3 key is provided
router.post(
  '/edit-image',
  authMiddleware,
  editImage
);

module.exports = router;