/**
 * In-Memory Video Generation Queue Service
 * Handles concurrent video generation requests without external dependencies
 * FREE - No Redis or external services required
 */

class VideoQueueService {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.currentJob = null;
    this.completedJobs = new Map(); // Store completed jobs for 1 hour
    this.failedJobs = new Map();
    this.maxConcurrent = 1; // Process one video at a time to avoid API quota issues
    this.jobTimeout = 10 * 60 * 1000; // 10 minutes max per job
  }

  /**
   * Add a job to the queue
   * @param {string} jobId - Unique job identifier
   * @param {object} jobData - Job data (userId, prompt, config, etc.)
   * @returns {object} - Job info with queue position
   */
  addJob(jobId, jobData) {
    // Check if job already exists
    const existingIndex = this.queue.findIndex(job => job.id === jobId);
    if (existingIndex !== -1) {
      return {
        jobId,
        status: 'queued',
        position: existingIndex + 1,
        queueLength: this.queue.length,
        message: 'Job already in queue'
      };
    }

    // Check if job is currently processing
    if (this.currentJob && this.currentJob.id === jobId) {
      return {
        jobId,
        status: 'processing',
        position: 0,
        queueLength: this.queue.length,
        message: 'Job is currently being processed'
      };
    }

    // Add job to queue
    const job = {
      id: jobId,
      data: jobData,
      status: 'queued',
      addedAt: Date.now(),
      userId: jobData.userId,
      prompt: jobData.prompt
    };

    this.queue.push(job);

    // Start processing if not already processing
    if (!this.processing) {
      this.processQueue();
    }

    return {
      jobId,
      status: 'queued',
      position: this.queue.length,
      queueLength: this.queue.length,
      estimatedWaitTime: this.queue.length * 90, // ~90 seconds per video
      message: 'Job added to queue successfully'
    };
  }

  /**
   * Get job status
   * @param {string} jobId - Job identifier
   * @returns {object} - Job status info
   */
  getJobStatus(jobId) {
    // Check if currently processing
    if (this.currentJob && this.currentJob.id === jobId) {
      return {
        jobId,
        status: 'processing',
        position: 0,
        queueLength: this.queue.length,
        message: 'Your video is being generated...',
        startedAt: this.currentJob.startedAt
      };
    }

    // Check if in queue
    const queueIndex = this.queue.findIndex(job => job.id === jobId);
    if (queueIndex !== -1) {
      return {
        jobId,
        status: 'queued',
        position: queueIndex + 1,
        queueLength: this.queue.length,
        estimatedWaitTime: (queueIndex + 1) * 90,
        message: `Your video is in queue. Position: ${queueIndex + 1}`
      };
    }

    // Check if completed
    if (this.completedJobs.has(jobId)) {
      return this.completedJobs.get(jobId);
    }

    // Check if failed
    if (this.failedJobs.has(jobId)) {
      return this.failedJobs.get(jobId);
    }

    return {
      jobId,
      status: 'not_found',
      message: 'Job not found. It may have expired or never existed.'
    };
  }

  /**
   * Process the queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      this.currentJob = {
        ...job,
        status: 'processing',
        startedAt: Date.now()
      };

      console.log(`[VideoQueue] Processing job ${job.id} (${this.queue.length} remaining in queue)`);

      try {
        // Set timeout for job
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Job timeout - exceeded 10 minutes')), this.jobTimeout);
        });

        // Execute the job with timeout
        const result = await Promise.race([
          job.data.processor(job.data),
          timeoutPromise
        ]);

        // Mark as completed
        this.completedJobs.set(job.id, {
          jobId: job.id,
          status: 'completed',
          result: result,
          completedAt: Date.now(),
          processingTime: Date.now() - this.currentJob.startedAt,
          message: 'Video generated successfully!'
        });

        console.log(`[VideoQueue] ✓ Job ${job.id} completed in ${(Date.now() - this.currentJob.startedAt) / 1000}s`);

        // Clean up completed job after 1 hour
        setTimeout(() => {
          this.completedJobs.delete(job.id);
        }, 60 * 60 * 1000);

      } catch (error) {
        console.error(`[VideoQueue] ✗ Job ${job.id} failed:`, error.message);

        // Mark as failed
        this.failedJobs.set(job.id, {
          jobId: job.id,
          status: 'failed',
          error: error.message,
          failedAt: Date.now(),
          message: 'Video generation failed'
        });

        // Clean up failed job after 1 hour
        setTimeout(() => {
          this.failedJobs.delete(job.id);
        }, 60 * 60 * 1000);
      }

      this.currentJob = null;
    }

    this.processing = false;
    console.log('[VideoQueue] Queue is empty');
  }

  /**
   * Get queue statistics
   * @returns {object} - Queue stats
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentJob: this.currentJob ? {
        jobId: this.currentJob.id,
        userId: this.currentJob.userId,
        startedAt: this.currentJob.startedAt,
        runningTime: Date.now() - this.currentJob.startedAt
      } : null,
      completedCount: this.completedJobs.size,
      failedCount: this.failedJobs.size,
      totalInQueue: this.queue.length + (this.processing ? 1 : 0)
    };
  }

  /**
   * Remove a job from queue (if not processing)
   * @param {string} jobId - Job identifier
   * @returns {boolean} - Success status
   */
  removeJob(jobId) {
    const index = this.queue.findIndex(job => job.id === jobId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      console.log(`[VideoQueue] Job ${jobId} removed from queue`);
      return true;
    }
    return false;
  }

  /**
   * Clear all completed and failed jobs
   */
  clearHistory() {
    this.completedJobs.clear();
    this.failedJobs.clear();
    console.log('[VideoQueue] History cleared');
  }

  /**
   * Get user's active jobs
   * @param {string} userId - User identifier
   * @returns {array} - User's jobs
   */
  getUserJobs(userId) {
    const jobs = [];

    // Check current job
    if (this.currentJob && this.currentJob.userId === userId) {
      jobs.push({
        jobId: this.currentJob.id,
        status: 'processing',
        position: 0
      });
    }

    // Check queue
    this.queue.forEach((job, index) => {
      if (job.userId === userId) {
        jobs.push({
          jobId: job.id,
          status: 'queued',
          position: index + 1
        });
      }
    });

    return jobs;
  }
}

// Export singleton instance
const videoQueueService = new VideoQueueService();
module.exports = videoQueueService;
