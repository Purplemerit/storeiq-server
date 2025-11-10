/**
 * In-Memory Background Removal Queue Service
 * Handles concurrent background removal requests without external dependencies
 * FREE - No Redis or external services required
 */

class BackgroundRemovalQueueService {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.currentJob = null;
    this.completedJobs = new Map(); // Store completed jobs for 1 hour
    this.failedJobs = new Map();
    this.maxConcurrent = 1; // Process one request at a time to respect API rate limits
    this.jobTimeout = 5 * 60 * 1000; // 5 minutes max per job
  }

  /**
   * Add a job to the queue
   * @param {string} jobId - Unique job identifier
   * @param {object} jobData - Job data (userId, imageUrl, config, etc.)
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
      userId: jobData.userId
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
      estimatedWaitTime: this.queue.length * 15, // ~15 seconds per background removal
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
        message: 'Removing background...',
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
        estimatedWaitTime: (queueIndex + 1) * 15,
        message: `Your request is in queue. Position: ${queueIndex + 1}`
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

      console.log(`[BGRemovalQueue] Processing job ${job.id} (${this.queue.length} remaining in queue)`);

      try {
        // Set timeout for job
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Job timeout - exceeded 5 minutes')), this.jobTimeout);
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
          message: 'Background removed successfully!'
        });

        console.log(`[BGRemovalQueue] ✓ Job ${job.id} completed in ${(Date.now() - this.currentJob.startedAt) / 1000}s`);

        // Clean up completed job after 1 hour
        setTimeout(() => {
          this.completedJobs.delete(job.id);
        }, 60 * 60 * 1000);

      } catch (error) {
        console.error(`[BGRemovalQueue] ✗ Job ${job.id} failed:`, error.message);

        // Mark as failed
        this.failedJobs.set(job.id, {
          jobId: job.id,
          status: 'failed',
          error: error.message,
          failedAt: Date.now(),
          message: 'Background removal failed'
        });

        // Clean up failed job after 1 hour
        setTimeout(() => {
          this.failedJobs.delete(job.id);
        }, 60 * 60 * 1000);
      }

      this.currentJob = null;
    }

    this.processing = false;
    console.log('[BGRemovalQueue] Queue is empty');
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
        id: this.currentJob.id,
        startedAt: this.currentJob.startedAt,
        duration: Date.now() - this.currentJob.startedAt
      } : null,
      completedCount: this.completedJobs.size,
      failedCount: this.failedJobs.size
    };
  }

  /**
   * Remove a job from the queue
   * @param {string} jobId - Job identifier
   * @returns {boolean} - True if removed
   */
  removeJob(jobId) {
    const index = this.queue.findIndex(job => job.id === jobId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      console.log(`[BGRemovalQueue] Job ${jobId} removed from queue`);
      return true;
    }
    return false;
  }

  /**
   * Clear all jobs (for testing or maintenance)
   */
  clearAll() {
    this.queue = [];
    this.completedJobs.clear();
    this.failedJobs.clear();
    this.currentJob = null;
    this.processing = false;
    console.log('[BGRemovalQueue] All jobs cleared');
  }
}

// Singleton instance
const backgroundRemovalQueueService = new BackgroundRemovalQueueService();

module.exports = backgroundRemovalQueueService;
