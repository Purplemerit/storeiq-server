// Simple JSON file-based job store for video editing (crop, etc.)

const fs = require('fs');
const path = require('path');
const JOBS_FILE = path.join(__dirname, 'videoEditJobs.json');

function loadJobs() {
  try {
    if (!fs.existsSync(JOBS_FILE)) return {};
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

function createJob({ type, videoUrl, s3Key, start, end, userId }) {
  const jobs = loadJobs();
  const jobId = Math.random().toString(36).slice(2, 12);
  jobs[jobId] = {
    jobId,
    type, // e.g., 'crop'
    videoUrl,
    s3Key,
    start,
    end,
    userId,
    status: 'pending',
    error: null,
    downloadUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveJobs(jobs);
  return jobs[jobId];
}

function updateJob(jobId, updates) {
  const jobs = loadJobs();
  if (!jobs[jobId]) return null;
  jobs[jobId] = { ...jobs[jobId], ...updates, updatedAt: new Date().toISOString() };
  saveJobs(jobs);
  return jobs[jobId];
}

function getJob(jobId) {
  const jobs = loadJobs();
  return jobs[jobId] || null;
}

function getPendingJobs(type) {
  const jobs = loadJobs();
  return Object.values(jobs).filter(j => j.status === 'pending' && (!type || j.type === type));
}

module.exports = { createJob, updateJob, getJob, getPendingJobs };