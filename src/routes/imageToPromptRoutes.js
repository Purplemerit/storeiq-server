const express = require("express");
const router = express.Router();
const authenticateToken = require("./authMiddleware");
const { getGeminiModel } = require("../aimodel/gemini");
const { getFileBuffer } = require("../s3Service");
const axios = require("axios");
const imageToPromptQueueService = require("../services/imageToPromptQueueService");

/**
 * POST /api/ai/image-to-prompt
 * Generate text prompt from image using Gemini Vision
 */
router.post("/image-to-prompt", authenticateToken, async (req, res) => {
  try {
    const {
      imageS3Key,
      imageUrl,
      promptStyle = "detailed",
      includeColors = true,
      includeMood = true,
      includeComposition = true,
    } = req.body;

    const userId = req.user?.id || req.user?.email || "anonymous";

    // Validate input
    if (!imageS3Key && !imageUrl) {
      return res.status(400).json({
        error: "Either imageS3Key or imageUrl is required",
      });
    }

    // Create processor function that will be executed by the queue
    const processor = async () => {
      try {
        console.log(`[ImageToPrompt] Starting processing...`);

        // Get image data
        let imageBuffer;
        let mimeType = "image/jpeg";

        if (imageS3Key) {
          // Download from S3
          console.log(`[ImageToPrompt] Downloading image from S3: ${imageS3Key}`);
          imageBuffer = await getFileBuffer(imageS3Key);

          // Determine MIME type from S3 key
          if (imageS3Key.toLowerCase().endsWith(".png")) {
            mimeType = "image/png";
          } else if (
            imageS3Key.toLowerCase().endsWith(".jpg") ||
            imageS3Key.toLowerCase().endsWith(".jpeg")
          ) {
            mimeType = "image/jpeg";
          }
        } else if (imageUrl) {
          // Download from URL
          console.log(`[ImageToPrompt] Downloading image from URL: ${imageUrl}`);
          const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
          });
          imageBuffer = Buffer.from(response.data);
          mimeType = response.headers["content-type"] || "image/jpeg";
        }

        // Convert buffer to base64
        const base64Image = imageBuffer.toString("base64");

        // Build prompt based on style and options
        let systemPrompt = buildSystemPrompt(
          promptStyle,
          includeColors,
          includeMood,
          includeComposition
        );

        // Get Gemini model with vision
        // Note: Gemini 2.5 Flash supports multimodal (text + images)
        const model = getGeminiModel("models/gemini-2.0-flash-exp");

        // Generate prompt using Gemini Vision
        console.log(`[ImageToPrompt] Analyzing image with Gemini Vision...`);
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
        const generatedPrompt = response.text();

        console.log(
          `[ImageToPrompt] Generated prompt (${generatedPrompt.length} chars)`
        );

        return { prompt: generatedPrompt };
      } catch (error) {
        console.error(`[ImageToPrompt] Error in processor:`, error);
        throw error;
      }
    };

    // Add job to queue with metadata
    const jobId = imageToPromptQueueService.addJob(processor, {
      userId,
      imageS3Key,
      imageUrl,
      promptStyle,
      includeColors,
      includeMood,
      includeComposition,
      createdAt: new Date().toISOString(),
    });

    const status = imageToPromptQueueService.getJobStatus(jobId);

    console.log(`[ImageToPrompt] Job ${jobId} queued at position ${status.position}`);

    // Return 202 with job ID and queue info
    res.status(202).json({
      jobId,
      status: "queued",
      position: status.position,
      queueLength: status.queueLength,
      estimatedWaitTime: status.estimatedWaitTime,
      message: "Image-to-prompt generation job queued",
    });
  } catch (error) {
    console.error("[ImageToPrompt] Error creating job:", error);
    res.status(500).json({ error: "Failed to create job" });
  }
});

/**
 * GET /api/ai/image-to-prompt-status/:jobId
 * Check status of image-to-prompt job
 */
router.get("/image-to-prompt-status/:jobId", authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = imageToPromptQueueService.getJobStatus(jobId);

    if (status.status === "not_found") {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(status);
  } catch (error) {
    console.error("[ImageToPrompt] Error getting job status:", error);
    res.status(500).json({ error: "Failed to get job status" });
  }
});

/**
 * GET /api/ai/image-to-prompt-queue-stats
 * Get queue statistics
 */
router.get("/image-to-prompt-queue-stats", authenticateToken, async (req, res) => {
  try {
    const stats = imageToPromptQueueService.getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error("[ImageToPrompt] Error getting queue stats:", error);
    res.status(500).json({ error: "Failed to get queue stats" });
  }
});

/**
 * Build system prompt based on user preferences
 */
function buildSystemPrompt(style, includeColors, includeMood, includeComposition) {
  let basePrompt = "Analyze this image and generate a detailed text prompt that describes it.";

  // Add style instructions
  switch (style) {
    case "detailed":
      basePrompt += " Provide a comprehensive, detailed description covering all aspects of the image.";
      break;
    case "concise":
      basePrompt += " Provide a brief, focused description highlighting the key elements.";
      break;
    case "creative":
      basePrompt += " Provide an artistic, imaginative description that captures the essence and feeling of the image.";
      break;
    case "technical":
      basePrompt += " Provide a precise, technical description with specific details about composition, lighting, and style.";
      break;
  }

  // Add specific aspects to include
  const aspects = [];
  if (includeColors) aspects.push("colors and color schemes");
  if (includeMood) aspects.push("mood, atmosphere, and emotional tone");
  if (includeComposition) aspects.push("composition, framing, and perspective");

  if (aspects.length > 0) {
    basePrompt += ` Make sure to include details about: ${aspects.join(", ")}.`;
  }

  basePrompt += " The description should be suitable for use as a prompt for AI image generation.";

  return basePrompt;
}

module.exports = router;
