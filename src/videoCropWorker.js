// Video crop worker: polls for pending crop jobs, processes them with ffmpeg, uploads to S3, updates job status

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
    const duration = end - start;
    execFile('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-ss', String(start),
      '-t', String(duration),
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
  console.log(`[VIDEO-CROP][WORKER] Processing crop job:`, {
    jobId: job.jobId,
    videoUrl: job.videoUrl,
    s3Key: job.s3Key,
    start: job.start,
    end: job.end
  });
  try {
    // Download video if videoUrl is provided
    if (job.videoUrl) {
      inputPath = path.join(TMP_DIR, `input_${job.jobId}.mp4`);
      await downloadToFile(job.videoUrl, inputPath);
      cleanupInput = true;
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
    // For demo, userId is not used; in real use, pass userId
    const { url, key } = await uploadVideoBuffer(buffer, 'video/mp4', 'video-crop-demo');
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