/**
 * JobStore abstraction for video editing jobs.
 * Delegates to in-memory or SQLite implementation based on NODE_ENV.
 */
const {
  createJob,
  updateJob,
  getJob,
  getAllJobs,
  getPendingJobs
} = require('./JobStore');

module.exports = {
  createJob,
  updateJob,
  getJob,
  getAllJobs,
  getPendingJobs
};