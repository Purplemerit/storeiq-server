/**
 * scriptQueueService.js
 * In-memory queue for AI script generation (Gemini API)
 * Ensures only 1 script generation runs at a time to control costs
 */

class ScriptQueueService {
  constructor() {
    this.queue = [];
    this.jobs = new Map();
    this.processing = false;
    this.maxConcurrent = 1;
  }

  /**
   * Add a new script generation job to the queue
   * @param {Function} processor - Async function that performs the actual script generation
   * @param {Object} metadata - Job metadata (userId, prompt, etc.)
   * @returns {string} jobId
   */
  addJob(processor, metadata = {}) {
    const jobId = Math.random().toString(36).substring(2, 15);
    const job = {
      id: jobId,
      processor,
      metadata,
      status: "queued",
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    console.log(
      `[ScriptQueue] Job ${jobId} added to queue. Queue size: ${this.queue.length}`
    );

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return jobId;
  }

  /**
   * Process jobs in the queue sequentially
   */
  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);

      if (!job) continue;

      job.status = "processing";
      job.startedAt = Date.now();

      console.log(
        `[ScriptQueue] Processing job ${jobId}. Remaining in queue: ${this.queue.length}`
      );

      try {
        // Set a timeout for the job (5 minutes max)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Job timeout")), 5 * 60 * 1000)
        );

        const result = await Promise.race([
          job.processor(),
          timeoutPromise,
        ]);

        job.result = result;
        job.status = "completed";
        job.completedAt = Date.now();

        console.log(
          `[ScriptQueue] Job ${jobId} completed in ${
            job.completedAt - job.startedAt
          }ms`
        );
      } catch (error) {
        job.error = error.message || "Script generation failed";
        job.status = "failed";
        job.completedAt = Date.now();

        console.error(
          `[ScriptQueue] Job ${jobId} failed:`,
          error.message
        );
      }

      // Schedule cleanup after 1 hour
      setTimeout(() => {
        if (this.jobs.has(jobId)) {
          console.log(`[ScriptQueue] Cleaning up job ${jobId}`);
          this.jobs.delete(jobId);
        }
      }, 60 * 60 * 1000);
    }

    this.processing = false;
    console.log("[ScriptQueue] Queue processing complete");
  }

  /**
   * Get job status
   * @param {string} jobId
   * @returns {Object} Job status info
   */
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { status: "not_found" };
    }

    const position = this.queue.indexOf(jobId) + 1;
    const response = {
      status: job.status,
      position: position > 0 ? position : null,
      queueLength: this.queue.length,
    };

    if (job.status === "completed") {
      response.result = job.result;
    } else if (job.status === "failed") {
      response.error = job.error;
    } else if (job.status === "queued") {
      // Estimated wait time: position in queue * avg time per script (~30s)
      response.estimatedWaitTime = position * 30;
    }

    return response;
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue stats
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      totalJobs: this.jobs.size,
      processing: this.processing,
      jobs: Array.from(this.jobs.values()).map((job) => ({
        id: job.id,
        status: job.status,
        metadata: job.metadata,
        createdAt: job.createdAt,
      })),
    };
  }

  /**
   * Cancel a queued job
   * @param {string} jobId
   * @returns {boolean} Success status
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "queued") {
      return false;
    }

    const index = this.queue.indexOf(jobId);
    if (index > -1) {
      this.queue.splice(index, 1);
    }

    job.status = "cancelled";
    job.completedAt = Date.now();

    console.log(`[ScriptQueue] Job ${jobId} cancelled`);
    return true;
  }
}

// Export singleton instance
const scriptQueueService = new ScriptQueueService();
module.exports = scriptQueueService;
