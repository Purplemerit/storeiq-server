const express = require("express");
const multer = require("multer");
const { generateCompositeWithStability } = require("./stability-mobbing");

const upload = multer({ dest: "uploads/" });
const router = express.Router();

// Only accept the fields we actually send: image + mask
router.post(
  "/mob-image",
  upload.fields([
    { name: "image" },
    { name: "mask" }
  ]),
  async (req, res) => {
    try {
      const sceneFile = req.files?.image?.[0];
      const maskFile = req.files?.mask?.[0];
      const promptText = req.body.prompt;

      if (!sceneFile || !maskFile || !promptText) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const compositeImage = await generateCompositeWithStability(sceneFile, maskFile, promptText);
      res.json({ image: compositeImage });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
