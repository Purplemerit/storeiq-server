/**
 * thumbnailGeneratorQueueService.js
 * In-memory queue for AI thumbnail generation (Gemini Vision API)
 * Analyzes videos/images and generates optimized thumbnail designs
 */

class ThumbnailGeneratorQueueService {
  constructor() {
    this.queue = [];
    this.jobs = new Map();
    this.processing = false;
    this.maxConcurrent = 2; // Can process 2 thumbnail generations concurrently
  }

  /**
   * Add a new thumbnail generation job to the queue
   * @param {Function} processor - Async function that performs the actual thumbnail generation
   * @param {Object} metadata - Job metadata (userId, videoS3Key, etc.)
   * @returns {string} jobId
   */
  addJob(processor, metadata = {}) {
    const jobId = `thumbnail_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
      `[ThumbnailGeneratorQueue] Job ${jobId} added to queue. Queue size: ${this.queue.length}`
    );

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return jobId;
  }

  /**
   * Process jobs in the queue
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
        `[ThumbnailGeneratorQueue] Processing job ${jobId}. Remaining in queue: ${this.queue.length}`
      );

      try {
        // Set a timeout for the job (5 minutes max for thumbnail generation)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Job timeout - thumbnail generation took too long")), 5 * 60 * 1000)
        );

        const result = await Promise.race([
          job.processor(),
          timeoutPromise,
        ]);

        job.result = result;
        job.status = "completed";
        job.completedAt = Date.now();

        console.log(
          `[ThumbnailGeneratorQueue] Job ${jobId} completed in ${
            job.completedAt - job.startedAt
          }ms`
        );
      } catch (error) {
        job.error = error.message || "Thumbnail generation failed";
        job.status = "failed";
        job.completedAt = Date.now();

        console.error(
          `[ThumbnailGeneratorQueue] Job ${jobId} failed:`,
          error.message
        );
      }

      // Small delay between jobs to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.processing = false;
    console.log("[ThumbnailGeneratorQueue] Queue processing complete");
  }

  /**
   * Get job status and queue information
   * @param {string} jobId
   * @returns {Object} Status object
   */
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return {
        status: "not_found",
        error: "Job not found",
      };
    }

    const position = this.queue.indexOf(jobId) + 1;
    const queueLength = this.queue.length;

    // Estimate wait time: ~30 seconds per job average
    const estimatedWaitTime = position > 0 ? position * 30 : 0;

    const response = {
      jobId: job.id,
      status: job.status,
      position: position > 0 ? position : undefined,
      queueLength,
      estimatedWaitTime,
      createdAt: job.createdAt,
    };

    if (job.status === "completed" && job.result) {
      response.thumbnails = job.result.thumbnails;
    }

    if (job.status === "failed" && job.error) {
      response.error = job.error;
    }

    if (job.status === "processing") {
      response.processingTime = Date.now() - job.startedAt;
    }

    return response;
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue stats
   */
  getQueueStats() {
    const stats = {
      queueLength: this.queue.length,
      processing: this.processing,
      totalJobs: this.jobs.size,
      completedJobs: 0,
      failedJobs: 0,
      queuedJobs: 0,
      processingJobs: 0,
    };

    this.jobs.forEach((job) => {
      if (job.status === "completed") stats.completedJobs++;
      if (job.status === "failed") stats.failedJobs++;
      if (job.status === "queued") stats.queuedJobs++;
      if (job.status === "processing") stats.processingJobs++;
    });

    return stats;
  }

  /**
   * Cancel a job
   * @param {string} jobId
   * @returns {boolean} Success
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return false;
    }

    if (job.status === "queued") {
      const index = this.queue.indexOf(jobId);
      if (index > -1) {
        this.queue.splice(index, 1);
      }
      job.status = "cancelled";
      job.completedAt = Date.now();
      console.log(`[ThumbnailGeneratorQueue] Job ${jobId} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Clean up old completed/failed jobs (keep last 100)
   */
  cleanup() {
    const jobArray = Array.from(this.jobs.entries());
    const completedOrFailed = jobArray
      .filter(([_, job]) => job.status === "completed" || job.status === "failed")
      .sort((a, b) => b[1].completedAt - a[1].completedAt);

    if (completedOrFailed.length > 100) {
      const toDelete = completedOrFailed.slice(100);
      toDelete.forEach(([jobId]) => {
        this.jobs.delete(jobId);
      });
      console.log(`[ThumbnailGeneratorQueue] Cleaned up ${toDelete.length} old jobs`);
    }
  }
}

// Export singleton instance
module.exports = new ThumbnailGeneratorQueueService();
