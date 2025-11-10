/**
 * imageToPromptQueueService.js
 * In-memory queue for AI image-to-prompt generation (Gemini Vision API)
 * Ensures controlled concurrent processing to manage API limits
 */

class ImageToPromptQueueService {
  constructor() {
    this.queue = [];
    this.jobs = new Map();
    this.processing = false;
    this.maxConcurrent = 2; // Can process 2 image analyses concurrently
  }

  /**
   * Add a new image-to-prompt job to the queue
   * @param {Function} processor - Async function that performs the actual image analysis
   * @param {Object} metadata - Job metadata (userId, imageS3Key, etc.)
   * @returns {string} jobId
   */
  addJob(processor, metadata = {}) {
    const jobId = `img2prompt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
      `[ImageToPromptQueue] Job ${jobId} added to queue. Queue size: ${this.queue.length}`
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
        `[ImageToPromptQueue] Processing job ${jobId}. Remaining in queue: ${this.queue.length}`
      );

      try {
        // Set a timeout for the job (3 minutes max for image analysis)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Job timeout - image analysis took too long")), 3 * 60 * 1000)
        );

        const result = await Promise.race([
          job.processor(),
          timeoutPromise,
        ]);

        job.result = result;
        job.status = "completed";
        job.completedAt = Date.now();

        console.log(
          `[ImageToPromptQueue] Job ${jobId} completed in ${
            job.completedAt - job.startedAt
          }ms`
        );
      } catch (error) {
        job.error = error.message || "Image-to-prompt generation failed";
        job.status = "failed";
        job.completedAt = Date.now();

        console.error(
          `[ImageToPromptQueue] Job ${jobId} failed:`,
          error.message
        );
      }

      // Small delay between jobs to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.processing = false;
    console.log("[ImageToPromptQueue] Queue processing complete");
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

    // Estimate wait time: ~15 seconds per job average
    const estimatedWaitTime = position > 0 ? position * 15 : 0;

    const response = {
      jobId: job.id,
      status: job.status,
      position: position > 0 ? position : undefined,
      queueLength,
      estimatedWaitTime,
      createdAt: job.createdAt,
    };

    if (job.status === "completed" && job.result) {
      response.prompt = job.result.prompt;
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
      totalJobs: this.jobs.size,
      processing: this.processing,
      jobs: {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
    };

    for (const job of this.jobs.values()) {
      if (job.status in stats.jobs) {
        stats.jobs[job.status]++;
      }
    }

    return stats;
  }

  /**
   * Clean up old completed/failed jobs (keep last 100)
   */
  cleanup() {
    const completedJobs = Array.from(this.jobs.values())
      .filter(job => job.status === "completed" || job.status === "failed")
      .sort((a, b) => b.completedAt - a.completedAt);

    // Keep only the last 100 completed jobs
    if (completedJobs.length > 100) {
      const toDelete = completedJobs.slice(100);
      toDelete.forEach(job => {
        this.jobs.delete(job.id);
        console.log(`[ImageToPromptQueue] Cleaned up old job ${job.id}`);
      });
    }
  }

  /**
   * Cancel a queued job
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
      console.log(`[ImageToPromptQueue] Job ${jobId} cancelled`);
      return true;
    }

    return false; // Can't cancel if already processing or completed
  }
}

// Create singleton instance
const imageToPromptQueueService = new ImageToPromptQueueService();

// Run cleanup every hour
setInterval(() => {
  imageToPromptQueueService.cleanup();
}, 60 * 60 * 1000);

module.exports = imageToPromptQueueService;
