# 🌍 Veo Model Regional Availability

## Current Status

Based on your testing, here's what we know about Veo model availability:

### ✅ Available in `asia-southeast1`

| Model Type   | Model Name                 | Status                         |
| ------------ | -------------------------- | ------------------------------ |
| **standard** | `veo-3.0-generate-preview` | ✅ **Available** (Recommended) |
| **fast**     | `veo-3.0-fast-preview`     | ❌ Not available (404 error)   |
| **v2**       | `veo-2.0-generate`         | ❓ Unknown (not tested)        |

### 📍 Your Current Configuration

```env
GCP_PROJECT_ID=veo-video-generator-477310
GCP_LOCATION=asia-southeast1
VEO_MODEL_TYPE=standard  ✅ Recommended
```

---

## 🔍 Understanding the 404 Error

When you tried to use the `fast` model, you got:

```
Publisher Model `projects/.../models/veo-3.0-fast-preview` not found.
```

**This means:**

1. The `veo-3.0-fast-preview` model doesn't exist in `asia-southeast1` region
2. It might not be released yet, or
3. It's only available in specific regions (like `us-central1`)

---

## 🌐 Recommended Regions for Veo

Google's AI models typically have the best availability in these regions:

### Best Availability (Try First)

- **`us-central1`** (Iowa, USA) - Usually has newest models first
- **`us-east1`** (South Carolina, USA) - Good availability
- **`us-west1`** (Oregon, USA) - Good availability

### Good Availability

- **`europe-west4`** (Netherlands) - European option
- **`asia-southeast1`** (Singapore) - Your current region ✓

### Limited Availability

- Other regions may have limited model selection

---

## 🔧 How to Check Model Availability

### Method 1: Model Garden (Recommended)

1. Go to [Model Garden](https://console.cloud.google.com/vertex-ai/model-garden?project=veo-video-generator-477310)
2. Search for "Veo"
3. Click on each Veo model
4. Check "Available in regions" section
5. Note which regions support which models

### Method 2: Test Script

Run our test script to check:

```bash
# Test standard model (should work)
node test-veo.js standard

# Test fast model (will fail in asia-southeast1)
node test-veo.js fast

# Test v2 model (unknown)
node test-veo.js v2
```

### Method 3: gcloud CLI

```bash
# List all available models in your region
gcloud ai models list \
  --region=asia-southeast1 \
  --filter="displayName:veo"

# Check specific model
gcloud ai models describe veo-3.0-generate-preview \
  --region=asia-southeast1
```

---

## 🚀 Solutions

### Option 1: Stick with Standard Model (Recommended)

**Keep your current setup:**

```env
GCP_LOCATION=asia-southeast1
VEO_MODEL_TYPE=standard
```

**Pros:**

- ✅ Works now
- ✅ High quality
- ✅ No migration needed

**Cons:**

- ❌ No faster alternatives available
- ❌ Limited to one model variant

### Option 2: Switch to US Region

**Change your region:**

```env
GCP_LOCATION=us-central1  # Change this
VEO_MODEL_TYPE=standard   # Keep this
```

**Pros:**

- ✅ More model variants likely available
- ✅ Get access to new features first
- ✅ Better model selection

**Cons:**

- ❌ Higher latency from Asia
- ❌ May have different pricing
- ❌ Need to test existing setup

### Option 3: Multi-Region Strategy

**Use different regions for different models:**

```javascript
// Dynamic region selection based on model
function getRegionForModel(modelType) {
  const regionMap = {
    standard: "asia-southeast1", // Your current region
    fast: "us-central1", // US region for fast model
    v2: "us-central1", // US region for v2
  };
  return regionMap[modelType] || "asia-southeast1";
}
```

---

## ⚙️ If You Want to Try US Region

### Step 1: Update .env

```env
# Change region to US
GCP_LOCATION=us-central1

# Keep everything else the same
GCP_PROJECT_ID=veo-video-generator-477310
GOOGLE_APPLICATION_CREDENTIALS=./config/service-account-key.json
VEO_MODEL_TYPE=standard
```

### Step 2: Test Configuration

```bash
node src/geminiService.js
```

Should show:

```
GCP_LOCATION: us-central1
Veo API URL: https://us-central1-aiplatform.googleapis.com/...
```

### Step 3: Test Fast Model

```bash
node test-veo.js fast
```

If it works in `us-central1`, you'll know the fast model is available there!

---

## 📊 Expected Model Availability Matrix

| Model                    | asia-southeast1 | us-central1 | europe-west4 |
| ------------------------ | --------------- | ----------- | ------------ |
| veo-3.0-generate-preview | ✅ Yes          | ✅ Yes      | ✅ Likely    |
| veo-3.0-fast-preview     | ❌ No           | ✅ Likely   | ❓ Maybe     |
| veo-2.0-generate         | ❓ Unknown      | ✅ Likely   | ❓ Maybe     |

_This is based on typical Google Cloud model rollout patterns_

---

## 🎯 Recommendations

### For Production (Now)

```env
GCP_LOCATION=asia-southeast1
VEO_MODEL_TYPE=standard
```

- Use the **standard model** in your current region
- It's proven to work
- High quality output
- Stable and reliable

### For Testing New Models (Later)

```env
GCP_LOCATION=us-central1
VEO_MODEL_TYPE=fast  # or other variants
```

- Switch to **US region** to test new models
- Evaluate if faster models meet your quality needs
- Decide if latency trade-off is worth it

### Hybrid Approach

- Keep production in `asia-southeast1` with `standard` model
- Set up a dev/test environment in `us-central1` for new features
- Use environment-specific configurations

---

## 💡 Best Practices

1. **Always use `standard` model by default** - Most widely available
2. **Test model availability** before deploying to production
3. **Implement fallback logic** - If preferred model fails, fallback to standard
4. **Monitor model releases** - Check Model Garden regularly for new models
5. **Consider latency** - Choose region closest to your users when possible

---

## 🔄 Implementing Smart Fallback

Add this to your code for automatic fallback:

```javascript
async function generateVideoWithFallback(prompt, config = {}) {
  const { generateVideo } = require("./src/geminiService");

  // Try requested model first
  let result = await generateVideo(prompt, config);

  // If 404 or mock mode, fallback to standard
  if (result.mock && config.modelType !== "standard") {
    console.log(`⚠️  Falling back to standard model...`);
    result = await generateVideo(prompt, {
      ...config,
      modelType: "standard",
    });
  }

  return result;
}

// Usage
await generateVideoWithFallback("A cat playing", {
  modelType: "fast", // Will auto-fallback to standard if fast not available
});
```

---

## 📞 Next Steps

1. **Keep current setup** (asia-southeast1 + standard) for now ✅
2. **Enable Veo model** in Model Garden if not already done
3. **Test video generation** with standard model
4. **Consider US region** only if you need model variants
5. **Monitor announcements** for new model availability in Asia

---

## 🎬 Current Working Command

```bash
# This should work in your current setup
node test-veo.js standard
```

Once Veo is enabled in Model Garden, this will generate real videos! 🚀
