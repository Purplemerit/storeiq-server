# Veo-3 Video Generation Setup Guide

## 🎯 Overview

This guide explains how to properly set up **Google Veo-3** video generation using **Vertex AI** with **OAuth 2.0 authentication**.

## ⚠️ Important Notes

### API Endpoint Differences

| Service                | API Endpoint                         | Authentication              |
| ---------------------- | ------------------------------------ | --------------------------- |
| **Gemini** (Text/Chat) | `generativelanguage.googleapis.com`  | API Key                     |
| **Veo** (Video Gen)    | `{region}-aiplatform.googleapis.com` | OAuth 2.0 / Service Account |

**❌ Common Mistake:** Using `generativelanguage.googleapis.com` for Veo will result in 404 errors.

**✅ Correct:** Use Vertex AI endpoints with proper authentication.

---

## 🔧 Setup Instructions

### Step 1: Enable Google Cloud APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable these APIs:
   - **Vertex AI API**
   - **Cloud Resource Manager API**

```bash
# Using gcloud CLI
gcloud services enable aiplatform.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
```

### Step 1.5: Enable Veo Model in Vertex AI

**⚠️ IMPORTANT:** Enabling the API is not enough - you must also enable the Veo model!

#### Option A: Via Console (Recommended)

1. Go to [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/model-garden)
2. Search for **"Veo"** in the search bar
3. Click on **"Veo 3.0"** or **"Veo 3.0 Generate Preview"**
4. Click **"ENABLE"** or **"Enable API"** button
5. Accept the terms of service if prompted
6. Wait for the model to be enabled (may take a few minutes)

#### Option B: Via API Explorer

1. Go to [Vertex AI API Console](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com)
2. Make sure Vertex AI API is enabled
3. Navigate to **Model Garden** from the Vertex AI menu
4. Enable the Veo model as described above

#### Option C: Request Access (If Not Available)

If you don't see Veo in Model Garden:

1. **Check Regional Availability**: Veo may not be available in all regions
   - Try: `us-central1`, `us-east1`, `us-west1`, `europe-west4`
2. **Request Early Access**: Some models require allowlist approval
   - Go to [Google AI Test Kitchen](https://aitestkitchen.withgoogle.com/)
   - Or fill out [Vertex AI Preview Access Form](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/preview-access)
3. **Check Billing**: Ensure your project has billing enabled
4. **Check Quotas**: Navigate to **IAM & Admin > Quotas** and search for "Vertex AI"

**Note:** Veo 3 is currently in **Preview** and may have limited availability. If it's not available in your region, the code will automatically fall back to mock mode.

### Step 2: Create Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Name: `veo-video-generator`
4. Grant roles:
   - **Vertex AI User** (`roles/aiplatform.user`)
   - **Storage Object Creator** (`roles/storage.objectCreator`) - if saving to GCS

### Step 3: Generate Service Account Key

1. Click on your service account
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Choose **JSON** format
5. Download the key file (e.g., `service-account-key.json`)
6. Store it securely in your project (e.g., `server/config/`)

**⚠️ Security:** Never commit this file to git! Add to `.gitignore`.

### Step 4: Update Environment Variables

Edit your `.env` file:

```env
# Google Cloud Project Configuration
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1

# Service Account Key Path (absolute or relative to server root)
GOOGLE_APPLICATION_CREDENTIALS=./config/service-account-key.json

# Gemini API Key (for text generation)
GEMINI_API_KEY=AIzaSy...

# Remove this - Veo doesn't use API keys
# VEO3_API_KEY=...  ❌ NOT NEEDED
```

### Step 5: Install Dependencies

```bash
cd server
npm install google-auth-library
```

### Step 6: Update .gitignore

```gitignore
# Service account credentials
config/service-account-key.json
*.json

# Environment variables
.env
```

---

## 📝 Usage Example

### Generate Video (Async Operation)

```javascript
const {
  generateVideo,
  getVideoOperationStatus,
} = require("./src/geminiService");

async function createVideo() {
  try {
    // Start video generation
    const result = await generateVideo("A cat playing piano", {
      aspectRatio: "16:9",
      duration: 5,
      resolution: "720p",
    });

    if (result.mock) {
      console.log("⚠️ Mock mode:", result.message);
      return;
    }

    console.log("✓ Video generation started");
    console.log("Operation:", result.operationName);

    // Poll for completion
    let status;
    do {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s
      status = await getVideoOperationStatus(result.operationName);
      console.log("Status:", status.status, status.progress || "");
    } while (status.status === "PROCESSING");

    if (status.status === "COMPLETED") {
      console.log("✓ Video URL:", status.videoUrl);
      return status.videoUrl;
    } else {
      console.error("✗ Video generation failed:", status.error);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}
```

### Express Route Example

```javascript
const express = require("express");
const { generateVideo, getVideoOperationStatus } = require("../geminiService");

router.post("/api/generate-video", async (req, res) => {
  try {
    const { prompt, config } = req.body;
    const result = await generateVideo(prompt, config);

    if (result.mock) {
      return res.json({
        status: "mock",
        message: result.message,
        videoUrl: result.videoUrl,
      });
    }

    res.json({
      status: "processing",
      operationName: result.operationName,
      statusUrl: result.statusUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/video-status/:operationId", async (req, res) => {
  try {
    const operationName = decodeURIComponent(req.params.operationId);
    const status = await getVideoOperationStatus(operationName);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## � Complete Setup Checklist

Use this checklist to ensure you've completed all steps:

### Google Cloud Setup

- [ ] Created/selected a Google Cloud Project
- [ ] Enabled **Vertex AI API** (via Console or gcloud)
- [ ] Enabled **Cloud Resource Manager API**
- [ ] **Enabled Veo 3.0 Model** in Vertex AI Model Garden (CRITICAL!)
- [ ] Confirmed billing is enabled on the project
- [ ] Checked that Veo is available in your selected region

### Service Account Setup

- [ ] Created service account: `veo-video-generator`
- [ ] Granted role: **Vertex AI User** (`roles/aiplatform.user`)
- [ ] Granted role: **Storage Object Creator** (if needed)
- [ ] Generated and downloaded JSON key file
- [ ] Stored key file at: `server/config/service-account-key.json`
- [ ] Added `config/*.json` to `.gitignore`

### Environment Configuration

- [ ] Added `GCP_PROJECT_ID` to `.env`
- [ ] Added `GCP_LOCATION` to `.env` (default: `us-central1`)
- [ ] Added `GOOGLE_APPLICATION_CREDENTIALS` to `.env`
- [ ] Verified `GEMINI_API_KEY` is set
- [ ] Removed/commented out `VEO3_API_KEY` (not used)

### Testing

- [ ] Ran: `node src/geminiService.js`
- [ ] Verified all configuration checks show ✓
- [ ] Tested video generation with sample prompt
- [ ] Confirmed no 404 errors (model is enabled)
- [ ] Confirmed no 403 errors (permissions are correct)

---

## �🔍 Testing Configuration

Run this command to test your setup:

```bash
node src/geminiService.js
```

Expected output:

```
=== Gemini Service Configuration ===
GEMINI_API_KEY: ✓ Set
GCP_PROJECT_ID: ✓ Set (your-project-id)
GCP_LOCATION: us-central1
GOOGLE_APPLICATION_CREDENTIALS: ✓ Set
Veo API URL: https://us-central1-aiplatform.googleapis.com/v1/...
Google Auth: ✓ Initialized
====================================

✓ Gemini API Key is valid
```

---

## 🐛 Troubleshooting

### Error: "Google Auth not initialized"

**Cause:** `GOOGLE_APPLICATION_CREDENTIALS` not set or file not found

**Solution:**

1. Verify the path to your service account key file
2. Use absolute path if relative path doesn't work:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/service-account-key.json
   ```

### Error: "Veo-3 access denied" (403)

**Cause:** Service account doesn't have required permissions

**Solution:**

1. Go to [IAM Console](https://console.cloud.google.com/iam-admin/iam)
2. Find your service account
3. Add role: **Vertex AI User** (`roles/aiplatform.user`)

### Error: "Veo-3 model not available" (404)

**Cause:** Model not enabled in Vertex AI Model Garden, or not available in your region/project

**Solution:**

1. **Verify model is enabled:**

   - Go to [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/model-garden)
   - Search for "Veo"
   - Ensure it shows "Enabled" status
   - If not enabled, click "Enable" button

2. **Check regional availability:**

   - Veo may not be available in all regions
   - Try these regions in order:
     - `us-central1` (recommended)
     - `us-east1`
     - `us-west1`
     - `europe-west4`
   - Update `GCP_LOCATION` in `.env` if needed

3. **Verify model name:**

   - Model endpoint should be: `veo-3.0-generate-preview`
   - Check [Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) for exact name

4. **Request access (if needed):**

   - Veo 3 is currently in Preview/Early Access
   - You may need to request allowlist approval
   - Visit [Google AI Test Kitchen](https://aitestkitchen.withgoogle.com/)
   - Or fill out the [Vertex AI Preview Access Form](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/preview-access)

5. **Check billing:**
   - Ensure your project has an active billing account
   - Some preview models require billing to be enabled
   - Go to [Billing Settings](https://console.cloud.google.com/billing)

### Error: "Failed to obtain access token"

**Cause:** Invalid service account key or missing scopes

**Solution:**

1. Regenerate service account key
2. Ensure key file is valid JSON
3. Check file permissions (readable by Node.js process)

---

## 📚 References

- [Vertex AI Veo Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Google Auth Library](https://github.com/googleapis/google-auth-library-nodejs)
- [Service Account Authentication](https://cloud.google.com/docs/authentication/getting-started)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)

---

## 🎨 Video Configuration Options

```javascript
{
  aspectRatio: '16:9',    // '16:9', '9:16', '1:1'
  duration: 5,            // 5-10 seconds
  resolution: '720p',     // '720p', '1080p'
  // Additional Veo-specific parameters...
}
```

---

## 💡 Best Practices

1. **Environment Separation:** Use different service accounts for dev/staging/prod
2. **Error Handling:** Always handle mock/fallback responses gracefully
3. **Rate Limiting:** Implement request queuing for production
4. **Cost Management:** Monitor Vertex AI usage in Cloud Console
5. **Security:** Rotate service account keys regularly
6. **Async Processing:** Use job queues (Bull, BullMQ) for production video generation

---

## 📦 Complete .env Template

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=your-secret

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
AWS_BUCKET_NAME=...

# Google OAuth (for user login)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

# Gemini API (for text generation)
GEMINI_API_KEY=AIzaSy...

# Google Cloud (for Veo video generation)
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./config/service-account-key.json

# Other APIs
YOUTUBE_API_KEY=...
ELEVENLABS_API_KEY=...
BYTEZ_API_KEY=...

# Server
PORT=5000
FRONTEND_URL=http://localhost:5173
```
