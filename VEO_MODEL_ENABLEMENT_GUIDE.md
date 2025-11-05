# 🎬 How to Enable Veo Model in Google Cloud

## ⚠️ CRITICAL: Just enabling Vertex AI API is NOT enough!

Many developers miss this step: **You must explicitly enable the Veo model in Model Garden.**

---

## 🎯 Step-by-Step Visual Guide

### Step 1: Navigate to Vertex AI Model Garden

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project from the dropdown at the top
3. Click the hamburger menu (☰) in the top left
4. Navigate to: **Artificial Intelligence** → **Vertex AI** → **Model Garden**

**Direct Link:** https://console.cloud.google.com/vertex-ai/model-garden

---

### Step 2: Search for Veo

In the Model Garden:

1. Look for the search bar at the top
2. Type: **"Veo"** or **"Video"**
3. You should see models like:
   - **Veo 3.0 Generate Preview**
   - **Veo 2.0** (if available)
   - **Imagen** (different model for images)

---

### Step 3: Enable the Model

1. Click on **"Veo 3.0 Generate Preview"** (or latest version)
2. You'll see a model details page
3. Look for an **"ENABLE"** or **"ENABLE API"** button
4. Click it
5. Accept terms of service if prompted
6. Wait for confirmation (usually instant, but can take 1-2 minutes)

---

## 🔍 What You Should See

### ✅ Model Enabled Successfully

When enabled, you should see:

- Status: **"Enabled"** badge/indicator
- Option to **"Try it"** or **"Use in notebook"**
- API endpoint information
- Example code snippets

### ❌ Model Not Available

You might see:

- **"Request Access"** button → Model is in limited preview
- **"Not available in this region"** → Change region
- **"Enable billing"** message → Add billing account to project
- **No results found** → Model may not be released yet or name changed

---

## 🌍 Regional Availability

Veo is not available in all regions. Check these in order:

| Region      | Code              | Availability        |
| ----------- | ----------------- | ------------------- |
| US Central  | `us-central1`     | ✅ Most likely      |
| US East     | `us-east1`        | ✅ Likely           |
| US West     | `us-west1`        | ✅ Likely           |
| Europe West | `europe-west4`    | ⚠️ May be available |
| Asia        | `asia-southeast1` | ⚠️ Less likely      |

**To change region:**

1. Update your `.env` file:
   ```env
   GCP_LOCATION=us-central1
   ```
2. Restart your server
3. Test again

---

## 🔑 Required Permissions

Your service account needs these permissions:

### IAM Roles

- ✅ **Vertex AI User** (`roles/aiplatform.user`)
- ✅ **Service Account Token Creator** (if using default service account)

### To verify/add permissions:

1. Go to [IAM & Admin](https://console.cloud.google.com/iam-admin/iam)
2. Find your service account (e.g., `veo-video-generator@...`)
3. Click the pencil icon (Edit)
4. Add role: **Vertex AI User**
5. Click **Save**

---

## 💰 Billing Requirements

**Important:** Preview models often require an active billing account.

### To enable billing:

1. Go to [Billing](https://console.cloud.google.com/billing)
2. Link a billing account to your project
3. You may need to add a credit card (Google typically offers free credits)
4. Enable "Cloud Billing API" if prompted

**Note:** Many models have free quotas for testing, but you still need billing enabled.

---

## 🧪 Testing If Model is Enabled

Run this command to test:

```bash
cd server
node src/geminiService.js
```

### ✅ Expected Output (Model Enabled)

```
=== Gemini Service Configuration ===
GEMINI_API_KEY: ✓ Set
GCP_PROJECT_ID: ✓ Set (your-project-123)
GCP_LOCATION: us-central1
GOOGLE_APPLICATION_CREDENTIALS: ✓ Set
Veo API URL: https://us-central1-aiplatform.googleapis.com/v1/...
Google Auth: ✓ Initialized
====================================

✓ Gemini API Key is valid
```

### ❌ Common Error (Model Not Enabled)

If you get a 404 error when calling `generateVideo()`, it means:

- The model is not enabled in Model Garden, OR
- The model is not available in your region, OR
- The endpoint URL is incorrect

---

## 📞 Getting Help

### If Model is Not in Model Garden

1. **Check Google AI Updates:**

   - Visit [Google AI Blog](https://blog.google/technology/ai/)
   - Veo 3 was announced in December 2024
   - Public availability may be limited

2. **Request Early Access:**

   - [Google AI Test Kitchen](https://aitestkitchen.withgoogle.com/)
   - [Vertex AI Preview Programs](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/preview-access)

3. **Alternative Approach:**
   - Use **Imagen 3** for image generation (available now)
   - Use **Gemini 2.0** for text/chat (available now)
   - Wait for Veo wider availability

### If You Get Permission Errors

1. Verify service account has correct roles
2. Check that the JSON key file is valid
3. Ensure project ID matches in `.env` and key file
4. Try regenerating the service account key

---

## 🎬 Quick Start Commands

```bash
# 1. Enable APIs (from your machine with gcloud installed)
gcloud services enable aiplatform.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com

# 2. List available models (to verify Veo is accessible)
gcloud ai models list --region=us-central1 --filter="veo"

# 3. Test your configuration
cd server
node src/geminiService.js

# 4. Try generating a video (if model is enabled)
node -e "
const { generateVideo } = require('./src/geminiService');
generateVideo('A cat playing piano', { duration: 5 })
  .then(result => console.log('Result:', result))
  .catch(err => console.error('Error:', err.message));
"
```

---

## 📚 Additional Resources

- [Vertex AI Video Generation Docs](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Model Garden Documentation](https://cloud.google.com/vertex-ai/docs/start/explore-models)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)
- [Google Cloud Free Tier](https://cloud.google.com/free)

---

## 💡 Pro Tips

1. **Start with a trial project** - Create a new project just for testing Veo
2. **Monitor costs** - Set up budget alerts in Cloud Console
3. **Use mock mode** - The code falls back to mock videos if Veo isn't available
4. **Join waitlists** - Sign up for early access programs
5. **Check status page** - [Google Cloud Status](https://status.cloud.google.com/) for service issues

---

**Remember:** Enabling the Vertex AI API ≠ Enabling the Veo Model

You must do **BOTH**! ✅
