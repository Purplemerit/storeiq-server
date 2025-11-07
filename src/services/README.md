# Video Generation Queue Service

## Overview

This is a **FREE in-memory queue system** for managing concurrent video generation requests. No external dependencies like Redis required!

## Features

✅ **Queue Management** - Processes video generation requests one at a time
✅ **Job Tracking** - Track status of queued, processing, completed, and failed jobs
✅ **Position Updates** - Users see their queue position in real-time
✅ **Auto-Cleanup** - Completed/failed jobs automatically removed after 1 hour
✅ **Zero Cost** - No external services, runs in-memory
✅ **Simple Integration** - Easy to use with existing video generation code

## How It Works

### 1. User submits video generation request

```javascript
POST /api/gemini-veo3/generate-video
{
  "prompt": "A cat playing piano",
  "quality": "720P",
  "audioLanguage": "English"
}
```

### 2. Job added to queue

```javascript
Response (202 Accepted):
{
  "jobId": "abc123...",
  "status": "queued",
  "position": 3,
  "queueLength": 5,
  "estimatedWaitTime": 270,
  "statusUrl": "/api/gemini-veo3/job-status/abc123..."
}
```

### 3. Frontend polls for status

```javascript
GET /api/gemini-veo3/job-status/abc123...

// While queued:
{
  "jobId": "abc123...",
  "status": "queued",
  "position": 2,
  "estimatedWaitTime": 180
}

// While processing:
{
  "jobId": "abc123...",
  "status": "processing",
  "position": 0
}

// When completed:
{
  "jobId": "abc123...",
  "status": "completed",
  "s3Url": "https://...",
  "s3Key": "...",
  "resolution": "720p",
  "duration": 5
}
```

## API Endpoints

### Generate Video (Queued)

`POST /api/gemini-veo3/generate-video`

- Adds video generation job to queue
- Returns job ID and queue position
- Status: 202 Accepted

### Check Job Status

`GET /api/gemini-veo3/job-status/:jobId`

- Returns current status of the job
- Poll every 3-5 seconds until completed

### Queue Statistics

`GET /api/gemini-veo3/queue-stats`

- Returns queue statistics (admin/monitoring)
- Shows current processing job and queue length

### Cancel Job

`DELETE /api/gemini-veo3/job/:jobId`

- Cancels a queued job (cannot cancel if processing)

## Benefits

### For Users

- ✅ Transparent queue position
- ✅ Estimated wait time
- ✅ No unexpected errors from API overload
- ✅ Fair processing (first-come, first-served)

### For Your App

- ✅ Prevents API quota exhaustion
- ✅ Controls costs (one video at a time)
- ✅ Better error handling
- ✅ Scalable without infrastructure changes

### Cost Savings

- ✅ **$0/month** - No Redis, no Bull, no external queue service
- ✅ Works on any hosting (Vercel, Railway, Render, etc.)
- ✅ No memory overhead (jobs cleaned up automatically)

## Limitations

### ⚠️ Important Notes

1. **Jobs are lost on server restart** - This is in-memory only
2. **Single server only** - Won't work across multiple server instances
3. **No persistent storage** - Jobs deleted after 1 hour

### When to Upgrade

If you need:

- Job persistence across restarts → Use MongoDB-based queue
- Multi-server support → Use Redis + Bull
- Advanced scheduling → Use cron jobs + database

## Configuration

Edit `videoQueueService.js`:

```javascript
this.maxConcurrent = 1; // Process 1 video at a time
this.jobTimeout = 10 * 60 * 1000; // 10 minutes max per job
```

## Testing

### Test with 2 users simultaneously:

1. Open two browser windows
2. Both submit video generation at same time
3. First user: Position 1 (processing immediately)
4. Second user: Position 2 (queued)
5. Second video starts after first completes

### Check queue stats:

```bash
curl -X GET http://localhost:5000/api/gemini-veo3/queue-stats \
  -H "Cookie: your-auth-cookie"
```

## Troubleshooting

### Job stuck in queue?

- Check server logs for errors
- Verify Google Cloud credentials
- Check API quotas

### Queue not processing?

- Restart server to clear queue
- Check `videoQueueService.getStats()` for status

### Memory issues?

- Reduce job timeout
- Clear history more frequently
- Limit queue size (add max queue length check)

## Future Enhancements

### Easy upgrades:

1. **Add max queue length** - Reject new jobs if queue too long
2. **Priority levels** - Premium users get processed first
3. **Database persistence** - Save jobs to MongoDB
4. **Multi-server support** - Migrate to Redis when needed

---
