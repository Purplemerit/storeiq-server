const express = require('express');
const multer = require('multer');
const { handleGenerateScript, handleGenerateVideo } = require('../controllers/aiController');
const { 
  generateImage, 
  getImageJobStatus, 
  getImageQueueStats, 
  cancelImageJob 
} = require('../controllers/imageGeneratorController');
const { 
  editImage, 
  getEditImageJobStatus, 
  getEditImageQueueStats, 
  cancelEditImageJob 
} = require('../controllers/imageEditController');
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

// Image generation with queue
router.post('/generate-image', authMiddleware, generateImage);
router.get('/image-job-status/:jobId', authMiddleware, getImageJobStatus);
router.get('/image-queue-stats', authMiddleware, getImageQueueStats);
router.delete('/image-job/:jobId', authMiddleware, cancelImageJob);

// Image editing with queue
// POST /api/ai/edit-image
// Accepts JSON: { prompt: string, imageS3Key: string }
// No longer uses multer - image is uploaded to S3 first, then S3 key is provided
router.post('/edit-image', authMiddleware, editImage);
router.get('/edit-image-job-status/:jobId', authMiddleware, getEditImageJobStatus);
router.get('/edit-image-queue-stats', authMiddleware, getEditImageQueueStats);
router.delete('/edit-image-job/:jobId', authMiddleware, cancelEditImageJob);

module.exports = router;