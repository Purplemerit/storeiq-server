// src/aimodel/routes.js
const express = require("express");
const router = express.Router();
const videoModel = require("./bytez");
const verifyJWT = require("../routes/authMiddleware"); // adjust path if needed


router.post("/generate-video", verifyJWT, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    const { error, output } = await videoModel.run(prompt);

    if (error) {
      return res.status(502).json({ error: "Bytez model error", details: error });
    }

    // Normalize response
    let response = {};
    let videoUrl = null;
    if (typeof output === "string" && output.startsWith("http")) {
      response.url = output;
      videoUrl = output;
    } else {
      response.output = output;
    }

    // Save to DB (best-effort; does not break response if save fails)
    try {
      if (GeneratedVideo && req.user && req.user._id) {
        await GeneratedVideo.create({
          user: req.user._id,
          prompt,
          url: videoUrl,
          output: typeof output === "string" ? output : JSON.stringify(output)
        });
      }
    } catch (saveErr) {
      console.error("[/ai/generate-video] Failed to save GeneratedVideo:", saveErr);
      // don't fail the request because of DB logging errors
    }

    return res.json(response);
  } catch (err) {
    console.error("[/ai/generate-video] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
