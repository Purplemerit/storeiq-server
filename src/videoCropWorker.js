// Video crop worker: polls for pending crop jobs, processes them with ffmpeg, uploads to S3, updates job status
require('dotenv').config({ path: __dirname + '/../.env' });

const mongoose = require('mongoose');
const { getPendingJobs, updateJob } = require('./videoEditJob');
const { uploadVideoBuffer } = require('./s3Service');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');
const os = require('os');

const TMP_DIR = os.tmpdir();

async function downloadToFile(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function cropWithFfmpeg(inputPath, outputPath, start, end) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-y',
      '-ss', String(start),
      '-i', inputPath,
      '-to', String(end),
      '-c', 'copy',
      outputPath
    ], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });
}

async function processCropJob(job) {
  let inputPath, cleanupInput = false;
  if (!job.userId) {
    try {
      await updateJob(String(job.jobId), { status: 'failed', error: 'userId is required for export' });
    } catch (e) {
      console.error('[VIDEO-CROP][WORKER][ERROR] Failed to update job status to failed:', e);
    }
    throw new Error('userId is required for export and must be present in crop job');
  }
  console.log(`[VIDEO-CROP][WORKER] Processing crop job:`, {
    jobId: job.jobId,
    videoUrl: job.videoUrl,
    s3Key: job.s3Key,
    start: job.start,
    end: job.end,
    userId: job.userId
  });
  try {
    // Download video if videoUrl is provided
    if (job.videoUrl) {
      inputPath = path.join(TMP_DIR, `input_${job.jobId}.mp4`);
      await downloadToFile(job.videoUrl, inputPath);
      cleanupInput = true;
      // Check if input file exists after download
      if (!fs.existsSync(inputPath)) {
        const errMsg = `[VIDEO-CROP][WORKER] Input file missing after download: ${inputPath}`;
        console.error(errMsg);
        try {
          await updateJob(String(job.jobId), { status: 'failed', error: 'Input file missing after download' });
        } catch (e) {
          console.error('[VIDEO-CROP][WORKER][ERROR] Failed to update job status to failed:', e);
        }
        return;
      }
    } else if (job.s3Key) {
      // TODO: Download from S3 if needed
      throw new Error('s3Key input not implemented in demo');
    } else {
      throw new Error('No videoUrl or s3Key');
    }
    const outputPath = path.join(TMP_DIR, `output_${job.jobId}.mp4`);
    await cropWithFfmpeg(inputPath, outputPath, job.start, job.end);

    // Upload cropped video to S3
    const buffer = fs.readFileSync(outputPath);
    // Store cropped video in user-specific S3 folder/key
    if (!job.username || typeof job.username !== "string" || job.username.trim().length === 0) {
      const errMsg = `[VIDEO-CROP][WORKER][ERROR] job.username is missing or empty for jobId: ${job.jobId}`;
      console.error(errMsg);
      try {
        await updateJob(String(job.jobId), { status: 'failed', error: 'username is required for S3 upload' });
      } catch (e) {
        console.error('[VIDEO-CROP][WORKER][ERROR] Failed to update job status to failed:', e);
      }
      throw new Error('username is required for S3 upload and must be present in crop job');
    }
    const username = job.username.trim();
    console.log(`[VIDEO-CROP][WORKER][UPLOAD] About to upload. userId:`, job.userId, 'username:', username, 'typeof:', typeof job.userId);
    const { url, key } = await uploadVideoBuffer(buffer, 'video/mp4', job.userId, username, { edited: "true" });
    console.log(`[VIDEO-CROP][WORKER][UPLOAD] S3 upload result:`, { url, key });
    try {
      const updatedJob = await updateJob(String(job.jobId), { status: 'completed', downloadUrl: url, s3Key: key, error: null });
      if (!updatedJob) {
        console.warn(`[VIDEO-CROP][WORKER][ERROR] updateJob did not update any document for jobId: ${job.jobId}`);
      } else {
        console.log(`[VIDEO-CROP][WORKER][SUCCESS] Updated job:`, updatedJob);
      }
    } catch (e) {
      console.error('[VIDEO-CROP][WORKER][ERROR] Failed to update job status to completed:', e);
    }
    console.log(`[VIDEO-CROP][WORKER] Completed crop job:`, {
      jobId: job.jobId,
      downloadUrl: url
    });
    fs.unlinkSync(outputPath);
    if (cleanupInput) fs.unlinkSync(inputPath);
  } catch (err) {
    try {
      await updateJob(String(job.jobId), { status: 'failed', error: err.message });
    } catch (e) {
      console.error('[VIDEO-CROP][WORKER][ERROR] Failed to update job status to failed:', e);
    }
    console.error(`[VIDEO-CROP][WORKER] Failed crop job:`, {
      jobId: job.jobId,
      error: err.message
    });
    if (cleanupInput && inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
}

async function pollAndProcess() {
  let jobs;
  try {
    jobs = await getPendingJobs('crop');
    if (!Array.isArray(jobs)) jobs = [];
  } catch (err) {
    console.error('[VIDEO-CROP][WORKER] Failed to fetch pending jobs:', err);
    jobs = [];
  }
  if (jobs.length > 0) {
    console.log(`[VIDEO-CROP][WORKER] Found ${jobs.length} pending crop job(s)`);
    jobs.forEach(j => {
      console.log(`[VIDEO-CROP][WORKER][QUEUE] Pending job:`, {
        jobId: j.jobId,
        userId: j.userId,
        videoUrl: j.videoUrl,
        s3Key: j.s3Key,
        start: j.start,
        end: j.end,
        status: j.status
      });
    });
  }
  for (const job of jobs) {
    try {
      await updateJob(String(job.jobId), { status: 'processing' });
    } catch (e) {
      console.error('[VIDEO-CROP][WORKER][ERROR] Failed to update job status to processing:', e);
    }
    console.log(`[VIDEO-CROP][WORKER] Set job to processing:`, { jobId: job.jobId });
    await processCropJob(job);
  }
}

// Ensure mongoose connection before polling
async function startWorker() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/storeiq';
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('[VIDEO-CROP][WORKER] Mongoose connected. Starting polling.');
    setInterval(pollAndProcess, 10000);
  } catch (err) {
    console.error('[VIDEO-CROP][WORKER] Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}

startWorker();

module.exports = { pollAndProcess };