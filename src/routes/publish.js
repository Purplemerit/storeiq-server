const express = require("express");
const router = express.Router();
const publishController = require("../controllers/publishController");
const authMiddleware = require("./authMiddleware");

// POST /api/publish/youtube
router.post("/youtube", authMiddleware, publishController.publishToYouTube);

// POST /api/publish/instagram
router.post("/instagram", authMiddleware, publishController.publishToInstagram);

module.exports = router;