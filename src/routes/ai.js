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
// Accepts multipart/form-data: image (required), mask (optional), prompt (required)
router.post(
  '/edit-image',
  (req, res, next) => {
    console.log('[Route Debug] Path:', req.path);
    console.log('[Route Debug] Method:', req.method);
    console.log('[Route Debug] Content-Type:', req.headers['content-type']);
    console.log('[Route Debug] All Headers:', req.headers);
    next();
  },
  authMiddleware,
  (req, res, next) => {
    console.log('[Before Multer] req.body:', req.body);
    console.log('[Before Multer] Has req.read:', typeof req.read);
    next();
  },
  (req, res, next) => {
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'mask', maxCount: 1 }
    ])(req, res, (err) => {
      if (err) {
        console.error('[Multer] Error occurred:', err);
        return handleMulterError(err, req, res, next);
      }
      next();
    });
  },
  (req, res, next) => {
    console.log('[After Multer] req.body:', req.body);
    console.log('[After Multer] req.files:', req.files);
    if (!req.files) {
      console.error('[After Multer] ERROR: No files received!');
    }
    if (!req.body) {
      console.error('[After Multer] ERROR: No body received!');
    }
    next();
  },
  editImage
);

module.exports = router;