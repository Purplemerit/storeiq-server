const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { uploadVideoBuffer } = require("../s3Service");
const authMiddleware = require("../routes/authMiddleware"); // import your middleware

const router = express.Router();

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// POST /api/video/mount-audio (authenticated)
router.post("/mount-audio", authMiddleware, async (req, res) => {
  try {
    // Now req.user is available from authMiddleware
    const userId = req.user._id;
    const username = req.user.username;

    // Extract video and audio URLs
    const { videoUrl, audioUrl } = req.body;
    if (!videoUrl || !audioUrl) {
      return res.status(400).json({ error: "Video or audio URL missing" });
    }

    // Temp files
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-mount-"));
    const videoFile = path.join(tempDir, `video-${Date.now()}.mp4`);
    const audioFile = path.join(tempDir, `audio-${Date.now()}.mp3`);
    const outputFile = path.join(tempDir, `mounted-${Date.now()}.mp4`);

    const downloadFile = async (url, filePath) => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Failed to download file: ${url} | Status: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    };

    await downloadFile(videoUrl, videoFile);
    await downloadFile(audioUrl, audioFile);

    // Mount audio onto video
    await new Promise((resolve, reject) => {
      ffmpeg(videoFile)
        .input(audioFile)
        .outputOptions(["-c:v copy", "-c:a aac", "-map 0:v:0", "-map 1:a:0"])
        .save(outputFile)
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    // Upload to S3
    const videoBuffer = fs.readFileSync(outputFile);
    const { url: s3Url, key: s3Key } = await uploadVideoBuffer(
      videoBuffer,
      "video/mp4",
      userId,
      username,
      { edited: "true" }
    );

    // Cleanup
    fs.unlinkSync(videoFile);
    fs.unlinkSync(audioFile);
    fs.unlinkSync(outputFile);
    fs.rmdirSync(tempDir);

    res.json({ url: s3Url, s3Key });
  } catch (err) {
    console.error("Detailed Error:", err);
    res.status(500).json({ error: err.message || "Failed to mount video with audio" });
  }
});

module.exports = router;
