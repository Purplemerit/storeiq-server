require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST /api/remove-bg
router.post("/remove-bg", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder: "ai-objects",
      transformation: [
        { effect: "bgremoval" }, // remove background first
        { width: 400, crop: "scale" }, // then scale
      ],
    },
    (error, result) => {
      if (error) return res.status(500).json({ error: error.message });
      res.json({ url: result.secure_url, public_id: result.public_id });
    }
  );

  streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
});

module.exports = router;
