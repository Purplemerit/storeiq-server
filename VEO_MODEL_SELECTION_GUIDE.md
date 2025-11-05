# 🎬 Veo Model Selection Guide

## Overview

The Veo video generation service now supports **dynamic model selection**, allowing you to switch between different Veo model variants for different use cases.

---

## 🎯 Available Models

| Model Type   | Model Name                 | Speed            | Quality | Use Case                             |
| ------------ | -------------------------- | ---------------- | ------- | ------------------------------------ |
| **standard** | `veo-3.0-generate-preview` | Slower (1-2 min) | High    | Production videos, marketing content |
| **fast**     | `veo-3.0-fast-preview`     | Faster (~30 sec) | Medium  | Quick previews, testing              |
| **v2**       | `veo-2.0-generate`         | Medium           | Good    | Fallback option                      |

⚠️ **Note:** Not all models may be available in your region. Check the Model Garden to see what's enabled.

---

## 🔧 Configuration Methods

### Method 1: Environment Variable (Global Default)

Set the default model for all video generations in your `.env` file:

```env
# Options: 'standard', 'fast', 'v2'
VEO_MODEL_TYPE=standard
```

**Examples:**

```env
# High quality production (default)
VEO_MODEL_TYPE=standard

# Fast generation for testing
VEO_MODEL_TYPE=fast

# Use older version
VEO_MODEL_TYPE=v2
```

### Method 2: Per-Request Override (Dynamic)

Override the model type for individual video generation requests:

```javascript
const { generateVideo } = require("./src/geminiService");

// Use standard model (from .env default)
const video1 = await generateVideo("A cat playing piano", {
  aspectRatio: "16:9",
  duration: 5,
});

// Override to use fast model for this request
const video2 = await generateVideo("A dog running", {
  aspectRatio: "16:9",
  duration: 5,
  modelType: "fast", // 👈 Override here
});

// Use v2 model
const video3 = await generateVideo("A bird flying", {
  modelType: "v2",
});
```

---

## 📝 Usage Examples

### Express Route with Model Selection

```javascript
const express = require("express");
const { generateVideo } = require("../geminiService");

router.post("/api/generate-video", async (req, res) => {
  const { prompt, config } = req.body;

  // User can specify modelType in the request
  // e.g., { prompt: "...", config: { modelType: "fast", duration: 5 } }
  const result = await generateVideo(prompt, config);

  if (result.mock) {
    return res.json({
      status: "mock",
      message: result.message,
    });
  }

  res.json({
    operationName: result.operationName,
    statusUrl: result.statusUrl,
  });
});
```

### Frontend Request Example

```javascript
// Client-side code
async function generateVideoWithModel(prompt, modelType = "standard") {
  const response = await fetch("/api/generate-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt,
      config: {
        modelType: modelType, // 'standard', 'fast', or 'v2'
        aspectRatio: "16:9",
        duration: 5,
        resolution: "720p",
      },
    }),
  });

  return await response.json();
}

// Generate high-quality video
await generateVideoWithModel("A sunset over mountains", "standard");

// Generate quick preview
await generateVideoWithModel("A cityscape at night", "fast");
```

---

## ⚡ Performance Comparison

### Standard Model (`veo-3.0-generate-preview`)

- **Generation Time:** 1-2 minutes
- **Quality:** ⭐⭐⭐⭐⭐ Excellent
- **Resolution:** Up to 1080p
- **Best For:** Final production videos, marketing content
- **Cost:** Higher

### Fast Model (`veo-3.0-fast-preview`)

- **Generation Time:** ~30 seconds
- **Quality:** ⭐⭐⭐⭐ Good
- **Resolution:** Up to 720p
- **Best For:** Previews, testing, quick iterations
- **Cost:** Lower

### V2 Model (`veo-2.0-generate`)

- **Generation Time:** ~1 minute
- **Quality:** ⭐⭐⭐ Decent
- **Resolution:** Up to 720p
- **Best For:** Fallback when V3 is unavailable
- **Cost:** Medium

---

## 🎨 Complete Video Configuration

All available options you can pass to `generateVideo()`:

```javascript
await generateVideo(prompt, {
  // Model selection (NEW!)
  modelType: "standard", // 'standard', 'fast', or 'v2'

  // Video properties
  aspectRatio: "16:9", // '16:9', '9:16', '1:1'
  duration: 5, // 5-10 seconds
  resolution: "720p", // '720p', '1080p'

  // Additional parameters (check API docs for availability)
  style: "cinematic", // Optional: video style
  motion: "medium", // Optional: motion intensity
  // ... more parameters as available
});
```

---

## 🔍 Checking Current Configuration

Run this command to see which model is currently configured:

```bash
node src/geminiService.js
```

**Output:**

```
=== Gemini Service Configuration ===
GEMINI_API_KEY: ✓ Set
GCP_PROJECT_ID: veo-video-generator-477310
GCP_LOCATION: asia-southeast1
VEO_MODEL_TYPE: standard (veo-3.0-generate-preview)
GOOGLE_APPLICATION_CREDENTIALS: ✓ Set
Veo API URL: https://...
Google Auth: ✓ Initialized
====================================
```

---

## 🚀 Testing Different Models

Create a test script to compare models:

```javascript
const {
  generateVideo,
  getVideoOperationStatus,
} = require("./src/geminiService");

async function compareModels() {
  const prompt = "A happy cat playing with a ball";

  // Test standard model
  console.log("Testing STANDARD model...");
  const standard = await generateVideo(prompt, { modelType: "standard" });

  // Test fast model
  console.log("Testing FAST model...");
  const fast = await generateVideo(prompt, { modelType: "fast" });

  console.log("Results:", { standard, fast });
}

compareModels();
```

---

## ⚠️ Important Notes

1. **Model Availability:** Not all models may be available in all regions
2. **Model Enablement:** Each model variant must be enabled separately in Model Garden
3. **Pricing:** Different models may have different pricing tiers
4. **Fallback:** The code defaults to 'standard' if an invalid model type is specified

---

## 🔧 Adding New Models

When Google releases new Veo models, you can easily add them:

1. Open `src/geminiService.js`
2. Add to the `VEO_MODELS` object:

```javascript
const VEO_MODELS = {
  standard: "veo-3.0-generate-preview",
  fast: "veo-3.0-fast-preview",
  v2: "veo-2.0-generate",
  // Add new models here:
  ultra: "veo-3.0-ultra-preview", // Example
  lite: "veo-3.0-lite-preview", // Example
};
```

3. Update your `.env`:

```env
VEO_MODEL_TYPE=ultra
```

---

## 📊 Monitoring & Analytics

### Track Model Usage

```javascript
// Log which model was used for analytics
router.post("/api/generate-video", async (req, res) => {
  const { prompt, config } = req.body;
  const modelType = config.modelType || process.env.VEO_MODEL_TYPE;

  console.log(`Video generation requested - Model: ${modelType}`);

  const result = await generateVideo(prompt, config);

  // Store in database for analytics
  await VideoLog.create({
    prompt,
    modelType,
    operationName: result.operationName,
    timestamp: new Date(),
  });

  res.json(result);
});
```

---

## 💡 Best Practices

1. **Use 'fast' for development/testing** - Save costs and time during development
2. **Use 'standard' for production** - Better quality for end users
3. **Implement caching** - Cache generated videos to avoid regeneration
4. **Set reasonable defaults** - Use .env for your primary use case
5. **Allow user choice** - Let premium users choose their preferred model
6. **Monitor costs** - Track which models are used most and their costs

---

## 🎬 Real-World Example

```javascript
// E-commerce product video generator
async function generateProductVideo(product, quality = "auto") {
  let modelType;

  // Intelligent model selection
  if (quality === "auto") {
    // Use fast for previews, standard for published videos
    modelType = product.isPublished ? "standard" : "fast";
  } else {
    modelType = quality;
  }

  const prompt = `A ${product.name} with ${product.description}`;

  return await generateVideo(prompt, {
    modelType,
    aspectRatio: product.videoFormat || "16:9",
    duration: 5,
    resolution: product.isPublished ? "1080p" : "720p",
  });
}

// Quick preview
await generateProductVideo(product, "fast");

// Final published video
await generateProductVideo(product, "standard");
```

---

## 📞 Support

For issues or questions:

- Check Model Garden for available models
- Review the [Veo API Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- Run diagnostics: `node src/geminiService.js`

---

**Happy video generating! 🎥**
