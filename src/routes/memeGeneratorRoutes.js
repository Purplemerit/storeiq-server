const express = require("express");
const router = express.Router();
const authenticateToken = require("./authMiddleware");
const { getGeminiModel } = require("../aimodel/gemini");
const axios = require("axios");
const memeGeneratorQueueService = require("../services/memeGeneratorQueueService");
const multer = require("multer");

// Configure multer for in-memory file storage (no disk/S3 upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

/**
 * POST /api/ai/generate-meme
 * Generate funny meme captions from image using Gemini Vision
 */
router.post("/generate-meme", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const {
      imageUrl,
      memeStyle = "classic", // classic, sarcastic, wholesome, absurd, relatable
      captionCount = "3",
      modelName = "gemini-2.5-flash",
    } = req.body;

    const userId = req.user?.id || req.user?.email || "anonymous";
    const uploadedFile = req.file; // File from FormData

    // Convert string values to proper types
    const captionCountNumber = parseInt(captionCount, 10);

    // Validate input
    if (!uploadedFile && !imageUrl) {
      return res.status(400).json({
        error: "Either file upload or imageUrl is required",
      });
    }

    // Validate model name
    const allowedModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
    if (!allowedModels.includes(modelName)) {
      return res.status(400).json({
        error: `Invalid model name. Allowed models: ${allowedModels.join(", ")}`,
      });
    }

    // Validate caption count
    if (captionCountNumber < 1 || captionCountNumber > 5) {
      return res.status(400).json({
        error: "captionCount must be between 1 and 5",
      });
    }

    // Create processor function that will be executed by the queue
    const processor = async () => {
      try {
        console.log(`[MemeGenerator] Starting processing...`);

        // Get image data
        let imageBuffer;
        let mimeType = "image/jpeg";

        if (uploadedFile) {
          // Use uploaded file from memory (no S3 storage)
          console.log(`[MemeGenerator] Processing uploaded file: ${uploadedFile.originalname}`);
          imageBuffer = uploadedFile.buffer;
          mimeType = uploadedFile.mimetype;
        } else if (imageUrl) {
          // Download from URL
          console.log(`[MemeGenerator] Downloading image from URL: ${imageUrl}`);
          const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
          });
          imageBuffer = Buffer.from(response.data);
          mimeType = response.headers["content-type"] || "image/jpeg";
        }

        // Convert buffer to base64
        const base64Image = imageBuffer.toString("base64");

        // Build prompt based on meme style
        let systemPrompt = buildMemePrompt(memeStyle, captionCountNumber);

        // Get Gemini model with vision
        console.log(`[MemeGenerator] Using model: ${modelName}`);
        const model = getGeminiModel(modelName);

        // Generate meme captions using Gemini Vision
        console.log(`[MemeGenerator] Analyzing image and generating meme captions...`);
        const result = await model.generateContent([
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          systemPrompt,
        ]);

        const response = await result.response;
        const generatedText = response.text();

        // Parse the response to extract captions
        const captions = parseMemeResponse(generatedText);

        console.log(
          `[MemeGenerator] Generated ${captions.length} meme captions`
        );

        return { 
          captions,
          memeStyle,
        };
      } catch (error) {
        console.error(`[MemeGenerator] Error in processor:`, error);
        throw error;
      }
    };

    // Add job to queue with metadata
    const jobId = memeGeneratorQueueService.addJob(processor, {
      userId,
      hasUploadedFile: !!uploadedFile,
      imageUrl,
      memeStyle,
      captionCount: captionCountNumber,
      createdAt: new Date().toISOString(),
    });

    const status = memeGeneratorQueueService.getJobStatus(jobId);

    console.log(`[MemeGenerator] Job ${jobId} queued at position ${status.position}`);

    // Return 202 with job ID and queue info
    res.status(202).json({
      jobId,
      status: "queued",
      position: status.position,
      queueLength: status.queueLength,
      estimatedWaitTime: status.estimatedWaitTime,
      message: "Meme generation job queued",
    });
  } catch (error) {
    console.error("[MemeGenerator] Error creating job:", error);
    res.status(500).json({ error: "Failed to create job" });
  }
});

/**
 * GET /api/ai/meme-status/:jobId
 * Check status of meme generation job
 */
router.get("/meme-status/:jobId", authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = memeGeneratorQueueService.getJobStatus(jobId);

    if (status.status === "not_found") {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(status);
  } catch (error) {
    console.error("[MemeGenerator] Error getting job status:", error);
    res.status(500).json({ error: "Failed to get job status" });
  }
});

/**
 * GET /api/ai/meme-queue-stats
 * Get queue statistics
 */
router.get("/meme-queue-stats", authenticateToken, async (req, res) => {
  try {
    const stats = memeGeneratorQueueService.getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error("[MemeGenerator] Error getting queue stats:", error);
    res.status(500).json({ error: "Failed to get queue stats" });
  }
});

/**
 * DELETE /api/ai/meme-job/:jobId
 * Cancel a meme generation job
 */
router.delete("/meme-job/:jobId", authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const cancelled = memeGeneratorQueueService.cancelJob(jobId);

    if (!cancelled) {
      return res.status(404).json({ error: "Job not found or cannot be cancelled" });
    }

    res.json({ message: "Job cancelled successfully" });
  } catch (error) {
    console.error("[MemeGenerator] Error cancelling job:", error);
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

/**
 * Build meme prompt based on style
 */
function buildMemePrompt(style, count) {
  let basePrompt = `Analyze this image and generate ${count} funny meme caption${count > 1 ? 's' : ''}.`;

  // Add style-specific instructions
  switch (style) {
    case "classic":
      basePrompt += " Use classic meme humor with top text and bottom text format. Make it relatable and timeless.";
      break;
    case "sarcastic":
      basePrompt += " Use sarcastic, witty, and ironic humor. Be clever and slightly edgy.";
      break;
    case "wholesome":
      basePrompt += " Use wholesome, positive, and heartwarming humor. Make it uplifting and feel-good.";
      break;
    case "absurd":
      basePrompt += " Use absurd, surreal, and random humor. Be weird and unexpected.";
      break;
    case "relatable":
      basePrompt += " Use relatable, everyday situation humor. Focus on common experiences and feelings.";
      break;
    default:
      basePrompt += " Make it funny and engaging.";
  }

  basePrompt += `\n\nFormat your response as a JSON array of objects, each with:
- "topText": The text that goes at the top of the meme (can be empty string if not needed)
- "bottomText": The text that goes at the bottom of the meme (can be empty string if not needed)
- "caption": A single-line caption if the meme doesn't use top/bottom text format
- "context": Brief explanation of why this is funny

Example format:
[
  {
    "topText": "WHEN YOU FINALLY",
    "bottomText": "UNDERSTAND THE ASSIGNMENT",
    "caption": "",
    "context": "Captures the feeling of accomplishment"
  },
  {
    "topText": "",
    "bottomText": "",
    "caption": "POV: You're the main character now",
    "context": "Relatable moment of feeling special"
  }
]

Generate exactly ${count} meme caption${count > 1 ? 's' : ''} based on what you see in the image.`;

  return basePrompt;
}

/**
 * Parse meme response from Gemini
 */
function parseMemeResponse(text) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }

    // Fallback: if no JSON found, create a simple caption object
    return [{
      topText: "",
      bottomText: "",
      caption: text.trim(),
      context: "AI-generated meme caption"
    }];
  } catch (error) {
    console.error("[MemeGenerator] Error parsing response:", error);
    // Return the raw text as a caption
    return [{
      topText: "",
      bottomText: "",
      caption: text.trim(),
      context: "AI-generated meme caption"
    }];
  }
}

module.exports = router;
