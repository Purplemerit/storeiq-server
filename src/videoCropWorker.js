// Video crop worker: polls for pending crop jobs, processes them with ffmpeg, uploads to S3, updates job status
require('dotenv').config({ path: __dirname + '/../.env' });

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
    updateJob(job.jobId, { status: 'failed', error: 'userId is required for export' });
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
        updateJob(job.jobId, { status: 'failed', error: 'Input file missing after download' });
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
    console.log(`[VIDEO-CROP][WORKER][UPLOAD] About to upload. userId:`, job.userId, 'typeof:', typeof job.userId);
    const { url, key } = await uploadVideoBuffer(buffer, 'video/mp4', job.userId, { edited: "true" });
    console.log(`[VIDEO-CROP][WORKER][UPLOAD] S3 upload result:`, { url, key });
    updateJob(job.jobId, { status: 'completed', downloadUrl: url, error: null });
    console.log(`[VIDEO-CROP][WORKER] Completed crop job:`, {
      jobId: job.jobId,
      downloadUrl: url
    });
    fs.unlinkSync(outputPath);
    if (cleanupInput) fs.unlinkSync(inputPath);
  } catch (err) {
    updateJob(job.jobId, { status: 'failed', error: err.message });
    console.error(`[VIDEO-CROP][WORKER] Failed crop job:`, {
      jobId: job.jobId,
      error: err.message
    });
    if (cleanupInput && inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
}

async function pollAndProcess() {
  const jobs = getPendingJobs('crop');
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
    updateJob(job.jobId, { status: 'processing' });
    console.log(`[VIDEO-CROP][WORKER] Set job to processing:`, { jobId: job.jobId });
    await processCropJob(job);
  }
}

// Poll every 10 seconds
setInterval(pollAndProcess, 10000);

module.exports = { pollAndProcess };