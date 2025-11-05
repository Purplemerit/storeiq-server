# Veo-3 Video Generation - Complete Implementation Guide

## Overview

This implementation provides full Veo-3 video generation with automatic operation polling, Cloud Storage download, and S3 upload.

## API Endpoints

### 1. Generate Video (Blocking - Recommended)

**Endpoint:** `POST /api/gemini-veo3/generate-video`

**Description:** Generates video and waits for completion. Returns S3 URL when ready.

**Headers:**

```
Content-Type: application/json
Cookie: token=<jwt_token>
```

**Request Body:**

```json
{
  "prompt": "Your video description",
  "quality": "720P", // "480P", "720P", or "1080P"
  "voiceSpeed": "1x" // Optional
}
```

**Response (Success):**

```json
{
  "success": true,
  "s3Url": "https://...",
  "s3Key": "videos/username/...",
  "resolution": "720p",
  "duration": 5,
  "operationName": "projects/.../operations/..."
}
```

**Response (Error):**

```json
{
  "error": "Error message",
  "details": {}
}
```

**Expected Duration:** 1-2 minutes

---

### 2. Generate Video (Non-blocking)

**Endpoint:** `POST /api/veo/generate`

**Description:** Starts video generation and returns immediately with operation name.

**Request Body:**

```json
{
  "prompt": "Your video description",
  "resolution": "720p",
  "sampleCount": 1,
  "generateAudio": true,
  "modelType": "standard" // or "fast", "v2"
}
```

**Response:**

```json
{
  "message": "Video generation started",
  "operationName": "projects/.../operations/...",
  "statusUrl": "https://...",
  "status": "PROCESSING"
}
```

---

### 3. Check Video Status

**Endpoint:** `GET /api/veo/status/:operationName`

**Description:** Check the status of a video generation operation.

**Response (Processing):**

```json
{
  "status": "PROCESSING",
  "progress": 45,
  "metadata": {}
}
```

**Response (Completed):**

```json
{
  "status": "COMPLETED",
  "videos": [
    {
      "url": "gs://bucket/video.mp4",
      "mimeType": "video/mp4",
      "type": "gcs"
    }
  ]
}
```

---

### 4. Generate and Wait

**Endpoint:** `POST /api/veo/generate-and-wait`

**Description:** Generate video, wait for completion, and optionally upload to S3.

**Request Body:**

```json
{
  "prompt": "Your video description",
  "resolution": "720p",
  "sampleCount": 1,
  "generateAudio": true,
  "modelType": "standard",
  "uploadToS3": true,
  "maxAttempts": 60,
  "pollInterval": 5000
}
```

---

### 5. Download and Upload

**Endpoint:** `POST /api/veo/download-and-upload`

**Description:** Download video from Cloud Storage and upload to S3.

**Request Body:**

```json
{
  "gcsUri": "gs://bucket/path/to/video.mp4"
}
```

**Response:**

```json
{
  "success": true,
  "s3Url": "https://...",
  "gcsUri": "gs://..."
}
```

---

## Backend Implementation

### Key Files

1. **`src/geminiService.js`**

   - `generateVideo()` - Start video generation
   - `getVideoOperationStatus()` - Check operation status
   - `generateVideoAndWait()` - Generate and wait for completion
   - `downloadVideoFromGCS()` - Download from Cloud Storage

2. **`src/routes/veo.js`**

   - All Veo-3 API endpoints
   - Status polling
   - S3 upload integration

3. **`src/aimodel/routes.js`**

   - `/gemini-veo3/generate-video` - Main endpoint for UI

4. **`src/server.js`**
   - Route mounting: `app.use("/api/veo", veoRoutes)`

---

## Environment Variables

```env
# Required for Veo-3
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./config/service-account-key.json
VEO_MODEL_TYPE=standard

# Optional
GEMINI_API_KEY=your-gemini-api-key
```

---

## Model Types

| Model Type | Speed  | Quality | Availability |
| ---------- | ------ | ------- | ------------ |
| `standard` | Medium | High    | All regions  |
| `fast`     | Fast   | Medium  | Limited      |
| `v2`       | Medium | Medium  | Limited      |

---

## Testing

### Test with CLI:

```bash
# Test with standard model
node test-veo.js standard

# Test with fast model
node test-veo.js fast
```

### Test with API:

```bash
curl -X POST http://localhost:5000/api/veo/generate-and-wait \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT" \
  -d '{
    "prompt": "A cat playing with yarn",
    "resolution": "720p",
    "uploadToS3": true
  }'
```

---

## Frontend Integration

### Current Implementation (VideoGenerator.tsx):

```typescript
const handleGenerateVideo = async () => {
  setVideoStatus("loading");

  const res = await fetch(`${API_BASE_URL}/api/gemini-veo3/generate-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      prompt,
      quality: selectedQuality,
      voiceSpeed: selectedVoiceSpeed,
    }),
  });

  const data = await res.json();
  setVideoUrl(data.s3Url);
  setVideoStatus("success");
};
```

**Key Features:**

- Automatic polling (handled by backend)
- Progress indication
- Error handling
- S3 upload included

---

## Flow Diagram

```
User Input → Frontend
              ↓
         API Request
              ↓
    Backend: generateVideoAndWait()
              ↓
    Start Video Generation (Veo-3)
              ↓
    Poll Status (every 5s)
              ↓
    Video Complete
              ↓
    Download from GCS
              ↓
    Upload to S3
              ↓
    Return S3 URL
              ↓
    Frontend: Display Video
```

---

## Error Handling

### Common Errors:

1. **Model Not Enabled**

   - Error: `Veo model not available in region`
   - Solution: Enable model in Vertex AI Model Garden

2. **Authentication Failed**

   - Error: `Failed to get access token`
   - Solution: Check service account credentials

3. **Timeout**

   - Error: `Video generation timeout`
   - Solution: Increase `maxAttempts` or check operation manually

4. **Region Availability**
   - Error: `404 Not Found`
   - Solution: Use `us-central1` region or check model availability

---

## Performance

- **Average Generation Time:** 60-120 seconds
- **Resolution:** 360p, 720p, 1080p
- **Max Duration:** ~5 seconds (Veo limitation)
- **Poll Interval:** 5 seconds
- **Max Attempts:** 60 (5 minutes total)

---

## Best Practices

1. **Always use `generateVideoAndWait()`** for user-facing features
2. **Set appropriate timeouts** based on resolution
3. **Show progress indicators** to users (1-2 minute wait)
4. **Handle mock mode** gracefully when model isn't enabled
5. **Log operations** for debugging
6. **Cache results** if the same prompt is used

---

## Troubleshooting

### Video generation returns 200 but no video:

- ✓ The API returns an operation, not a video immediately
- ✓ Poll the operation status endpoint
- ✓ Wait for `operation.done === true`

### Frontend shows "No video URL returned":

- ✓ Backend must wait for operation completion
- ✓ Use `generateVideoAndWait()` instead of `generateVideo()`
- ✓ Check backend logs for operation status

### Operation stuck in PROCESSING:

- ✓ Check Vertex AI console for operation status
- ✓ Verify model is enabled in your region
- ✓ Check quota limits

---

## Next Steps

1. ✅ Backend implementation complete
2. ✅ Frontend integration complete
3. ✅ Error handling implemented
4. ✅ S3 upload integrated
5. 🔄 Test end-to-end flow
6. 📝 Monitor and optimize

---

## Support

For issues or questions:

1. Check Vertex AI console: https://console.cloud.google.com/vertex-ai
2. Review server logs for detailed error messages
3. Test with `test-veo.js` script
4. Verify environment variables are set correctly
