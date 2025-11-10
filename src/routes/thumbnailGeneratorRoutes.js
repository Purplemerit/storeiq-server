const express = require("express");
const router = express.Router();
const authenticateToken = require("./authMiddleware");
const { getGeminiModel } = require("../aimodel/gemini");
const thumbnailGeneratorQueueService = require("../services/thumbnailGeneratorQueueService");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const os = require("os");
const multer = require("multer");

// Configure multer for in-memory file storage (no disk/S3 upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

/**
 * POST /api/ai/generate-thumbnail
 * Generate YouTube-optimized thumbnails from video/image using Gemini Vision
 */
router.post("/generate-thumbnail", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const {
      thumbnailStyle = "engaging", // engaging, bold, minimal, dramatic, playful
      textOverlay = "",
      includeEmoji = "false",
      colorScheme = "vibrant", // vibrant, dark, bright, pastel
      thumbnailCount = "3",
      modelName = "gemini-2.5-flash",
      mediaType = "image",
    } = req.body;

    const userId = req.user?.id || req.user?.email || "anonymous";
    const uploadedFile = req.file; // File from FormData

    // Convert string values to proper types
    const includeEmojiBoolean = includeEmoji === "true" || includeEmoji === true;
    const thumbnailCountNumber = parseInt(thumbnailCount, 10);

    // Validate input
    if (!uploadedFile) {
      return res.status(400).json({
        error: "File upload is required",
      });
    }

    // Validate model name
    const allowedModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
    if (!allowedModels.includes(modelName)) {
      return res.status(400).json({
        error: `Invalid model name. Allowed models: ${allowedModels.join(", ")}`,
      });
    }

    // Validate thumbnail count
    if (thumbnailCountNumber < 1 || thumbnailCountNumber > 5) {
      return res.status(400).json({
        error: "thumbnailCount must be between 1 and 5",
      });
    }

    // Create processor function that will be executed by the queue
    const processor = async () => {
      try {
        console.log(`[ThumbnailGenerator] Starting processing...`);

        // Get image/video data from uploaded file
        let imageBuffer;
        let mimeType = "image/jpeg";

        console.log(`[ThumbnailGenerator] Processing uploaded file: ${uploadedFile.originalname}`);
        
        if (mediaType === "video" || uploadedFile.mimetype.startsWith("video/")) {
          // For video, extract a frame using ffmpeg
          imageBuffer = await extractVideoFrame(uploadedFile.buffer);
          mimeType = "image/jpeg";
        } else {
          // For image, use directly
          imageBuffer = uploadedFile.buffer;
          mimeType = uploadedFile.mimetype;
        }

        // Convert buffer to base64
        const base64Image = imageBuffer.toString("base64");

        // Build prompt for thumbnail design
        let systemPrompt = buildThumbnailPrompt(
          thumbnailStyle,
          textOverlay,
          includeEmojiBoolean,
          colorScheme,
          thumbnailCountNumber
        );

        // Get Gemini model with vision
        console.log(`[ThumbnailGenerator] Using model: ${modelName}`);
        const model = getGeminiModel(modelName);

        // Generate thumbnail designs using Gemini Vision
        console.log(`[ThumbnailGenerator] Analyzing content and generating thumbnail designs...`);
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

        // Parse the response to extract thumbnail designs
        const thumbnailDesigns = parseThumbnailResponse(generatedText);

        // Generate actual thumbnail images with text overlays using sharp
        const thumbnails = await Promise.all(
          thumbnailDesigns.map(async (design, index) => {
            try {
              // Resize to YouTube thumbnail size (1280x720)
              let processedImage = await sharp(imageBuffer)
                .resize(1280, 720, {
                  fit: "cover",
                  position: "center",
                })
                .toBuffer();

              // Add text overlays if textElements exist
              if (design.textElements && design.textElements.length > 0) {
                const composites = [];

                for (const textElement of design.textElements) {
                  // Create SVG text overlay
                  const svgText = createTextOverlaySVG(
                    textElement.text,
                    textElement.position,
                    textElement.size,
                    textElement.color
                  );

                  composites.push({
                    input: Buffer.from(svgText),
                    gravity: getGravityFromPosition(textElement.position),
                  });
                }

                // Composite all text elements onto the image
                if (composites.length > 0) {
                  processedImage = await sharp(processedImage)
                    .composite(composites)
                    .toBuffer();
                }
              }

              const thumbnailBase64 = processedImage.toString("base64");

              return {
                id: index + 1,
                title: design.title,
                description: design.description,
                textElements: design.textElements,
                colorPalette: design.colorPalette,
                imageData: `data:image/jpeg;base64,${thumbnailBase64}`,
                layout: design.layout,
              };
            } catch (err) {
              console.error(`[ThumbnailGenerator] Error creating thumbnail ${index + 1}:`, err);
              return {
                id: index + 1,
                title: design.title,
                description: design.description,
                error: "Failed to generate image",
              };
            }
          })
        );

        console.log(
          `[ThumbnailGenerator] Generated ${thumbnails.length} thumbnails`
        );

        return { 
          thumbnails,
          thumbnailStyle,
        };
      } catch (error) {
        console.error(`[ThumbnailGenerator] Error in processor:`, error);
        throw error;
      }
    };

    // Add job to queue with metadata
    const jobId = thumbnailGeneratorQueueService.addJob(processor, {
      userId,
      fileName: uploadedFile.originalname,
      fileSize: uploadedFile.size,
      mediaType,
      thumbnailStyle,
      textOverlay,
      includeEmoji: includeEmojiBoolean,
      colorScheme,
      thumbnailCount: thumbnailCountNumber,
      createdAt: new Date().toISOString(),
    });

    const status = thumbnailGeneratorQueueService.getJobStatus(jobId);

    console.log(`[ThumbnailGenerator] Job ${jobId} queued at position ${status.position}`);

    // Return 202 with job ID and queue info
    res.status(202).json({
      jobId,
      status: "queued",
      position: status.position,
      queueLength: status.queueLength,
      estimatedWaitTime: status.estimatedWaitTime,
      message: "Thumbnail generation job queued",
    });
  } catch (error) {
    console.error("[ThumbnailGenerator] Error creating job:", error);
    res.status(500).json({ error: "Failed to create job" });
  }
});

/**
 * GET /api/ai/thumbnail-status/:jobId
 * Check status of thumbnail generation job
 */
router.get("/thumbnail-status/:jobId", authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = thumbnailGeneratorQueueService.getJobStatus(jobId);

    if (status.status === "not_found") {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(status);
  } catch (error) {
    console.error("[ThumbnailGenerator] Error getting job status:", error);
    res.status(500).json({ error: "Failed to get job status" });
  }
});

/**
 * GET /api/ai/thumbnail-queue-stats
 * Get queue statistics
 */
router.get("/thumbnail-queue-stats", authenticateToken, async (req, res) => {
  try {
    const stats = thumbnailGeneratorQueueService.getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error("[ThumbnailGenerator] Error getting queue stats:", error);
    res.status(500).json({ error: "Failed to get queue stats" });
  }
});

/**
 * DELETE /api/ai/thumbnail-job/:jobId
 * Cancel a thumbnail generation job
 */
router.delete("/thumbnail-job/:jobId", authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const cancelled = thumbnailGeneratorQueueService.cancelJob(jobId);

    if (!cancelled) {
      return res.status(404).json({ error: "Job not found or cannot be cancelled" });
    }

    res.json({ message: "Job cancelled successfully" });
  } catch (error) {
    console.error("[ThumbnailGenerator] Error cancelling job:", error);
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

/**
 * Build thumbnail prompt based on style and preferences
 */
function buildThumbnailPrompt(style, textOverlay, includeEmoji, colorScheme, count) {
  let basePrompt = `Analyze this image/video frame and generate ${count} YouTube thumbnail design${count > 1 ? 's' : ''}.`;

  // Add style-specific instructions
  switch (style) {
    case "engaging":
      basePrompt += " Create eye-catching, click-worthy designs that grab attention while being authentic.";
      break;
    case "bold":
      basePrompt += " Create bold, high-contrast designs with dramatic elements that stand out in search results.";
      break;
    case "minimal":
      basePrompt += " Create clean, minimalist designs with clear focus and simple color schemes.";
      break;
    case "dramatic":
      basePrompt += " Create dramatic, emotional designs with intense colors and powerful compositions.";
      break;
    case "playful":
      basePrompt += " Create fun, playful designs with bright colors and energetic vibes.";
      break;
  }

  // Add color scheme guidance
  basePrompt += ` Use a ${colorScheme} color palette.`;

  // Add text overlay guidance
  if (textOverlay) {
    basePrompt += ` Include the text "${textOverlay}" prominently in the design.`;
  }

  // Add emoji guidance
  if (includeEmoji) {
    basePrompt += " Include relevant emojis to enhance engagement.";
  }

  basePrompt += `\n\nFormat your response as a JSON array of thumbnail designs, each with:
- "title": A catchy title for this thumbnail concept
- "description": Brief explanation of the design concept
- "textElements": Array of text elements to overlay (text, position, size, color)
- "colorPalette": Suggested color palette (array of hex colors)
- "layout": Layout description (e.g., "center-focused", "split-screen", "rule-of-thirds")

Example format:
[
  {
    "title": "Bold Central Focus",
    "description": "Main subject in center with vibrant background",
    "textElements": [
      {"text": "AMAZING!", "position": "top", "size": "large", "color": "#FF0000"}
    ],
    "colorPalette": ["#FF0000", "#FFD700", "#000000"],
    "layout": "center-focused"
  }
]

YouTube thumbnail specs: 1280x720px, make designs stand out in small preview sizes.
Generate exactly ${count} thumbnail design${count > 1 ? 's' : ''} optimized for maximum click-through rate.`;

  return basePrompt;
}

/**
 * Parse thumbnail response from Gemini
 */
function parseThumbnailResponse(text) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }

    // Fallback: create a basic design
    return [{
      title: "Generated Thumbnail",
      description: "AI-generated thumbnail design",
      textElements: [],
      colorPalette: ["#FF0000", "#FFFFFF", "#000000"],
      layout: "center-focused"
    }];
  } catch (error) {
    console.error("[ThumbnailGenerator] Error parsing response:", error);
    return [{
      title: "Generated Thumbnail",
      description: "AI-generated thumbnail design",
      textElements: [],
      colorPalette: ["#FF0000", "#FFFFFF", "#000000"],
      layout: "center-focused"
    }];
  }
}

/**
 * Extract a frame from video buffer using ffmpeg
 */
async function extractVideoFrame(videoBuffer) {
  return new Promise((resolve, reject) => {
    // Create temporary file for the video
    const tempVideoPath = path.join(os.tmpdir(), `temp-video-${Date.now()}.mp4`);
    const tempFramePath = path.join(os.tmpdir(), `temp-frame-${Date.now()}.jpg`);

    // Write video buffer to temporary file
    fs.writeFileSync(tempVideoPath, videoBuffer);

    console.log('[ThumbnailGenerator] Extracting frame from temporary video file');

    ffmpeg(tempVideoPath)
      .seekInput(1)              // Seek to 1 second
      .frames(1)                 // Extract only 1 frame
      .output(tempFramePath)     // Output to temp file
      .outputOptions('-q:v 2')   // High quality JPEG
      .on('start', (cmd) => {
        console.log('[ThumbnailGenerator] FFmpeg command:', cmd);
      })
      .on('error', (err) => {
        console.error('[ThumbnailGenerator] FFmpeg error:', err);
        // Cleanup temp files
        try {
          if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
          if (fs.existsSync(tempFramePath)) fs.unlinkSync(tempFramePath);
        } catch (cleanupErr) {
          console.error('[ThumbnailGenerator] Cleanup error:', cleanupErr);
        }
        reject(new Error(`Failed to extract video frame: ${err.message}`));
      })
      .on('end', () => {
        console.log('[ThumbnailGenerator] FFmpeg frame extraction complete');
        try {
          // Read the extracted frame
          const frameBuffer = fs.readFileSync(tempFramePath);
          
          // Cleanup temp files
          if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
          if (fs.existsSync(tempFramePath)) fs.unlinkSync(tempFramePath);
          
          if (frameBuffer.length === 0) {
            reject(new Error('No frame data extracted'));
          } else {
            resolve(frameBuffer);
          }
        } catch (readErr) {
          console.error('[ThumbnailGenerator] Error reading frame:', readErr);
          reject(readErr);
        }
      })
      .run();
  });
}

/**
 * Create SVG text overlay for thumbnail
 */
function createTextOverlaySVG(text, position, size, color) {
  // Determine font size based on size parameter
  let fontSize = 80;
  if (size === "small") fontSize = 50;
  else if (size === "medium") fontSize = 70;
  else if (size === "large") fontSize = 90;
  else if (size === "xlarge") fontSize = 110;

  // Determine Y position based on position parameter
  let y = 360; // center
  if (position === "top") y = 100;
  else if (position === "bottom") y = 620;

  // Add stroke for better readability
  const strokeWidth = 4;
  const strokeColor = color === "#FFFFFF" ? "#000000" : "#FFFFFF";

  // Create SVG with text
  const svg = `
    <svg width="1280" height="720">
      <style>
        .text { 
          font-family: 'Arial Black', Arial, sans-serif; 
          font-weight: 900;
          font-size: ${fontSize}px;
          fill: ${color};
          stroke: ${strokeColor};
          stroke-width: ${strokeWidth}px;
          paint-order: stroke fill;
          text-anchor: middle;
          dominant-baseline: middle;
        }
      </style>
      <text x="640" y="${y}" class="text">${escapeXml(text)}</text>
    </svg>
  `.trim();

  return svg;
}

/**
 * Get Sharp gravity from position string
 */
function getGravityFromPosition(position) {
  switch (position?.toLowerCase()) {
    case "top":
      return "north";
    case "bottom":
      return "south";
    case "left":
      return "west";
    case "right":
      return "east";
    case "center":
    default:
      return "center";
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = router;
