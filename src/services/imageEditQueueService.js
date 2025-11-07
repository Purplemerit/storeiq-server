/**
 * Image Edit Queue Service
 * Manages queue for image editing operations to prevent concurrent API calls
 * 
 * Features:
 * - Sequential processing (one edit at a time)
 * - Job status tracking
 * - Queue position monitoring
 * - Automatic cleanup of completed jobs
 * - 5-minute timeout per job
 * 
 * Usage:
 * const jobResult = imageEditQueueService.addJob(jobId, { userId, processor, ... });
 * const status = imageEditQueueService.getJobStatus(jobId);
 */

class ImageEditQueueService {
  constructor() {
    this.queue = [];
    this.jobs = new Map(); // jobId -> job data
    this.processing = false;
    this.currentJob = null;
    this.completedCount = 0;
    this.failedCount = 0;
    
    // Estimated time per image edit (in seconds)
    this.estimatedTimePerJob = 25; // ~25 seconds per edit
    
    console.log('[ImageEditQueue] Service initialized');
  }

  /**
   * Add a new job to the queue
   * @param {string} jobId - Unique job identifier
   * @param {object} jobData - Job data containing userId, username, prompt, imageS3Key, processor function
   * @returns {object} Job status with position and estimated wait time
   */
  addJob(jobId, jobData) {
    if (this.jobs.has(jobId)) {
      console.log(`[ImageEditQueue] Job ${jobId} already exists`);
      return this.getJobStatus(jobId);
    }

    const job = {
      jobId,
      status: 'queued',
      createdAt: Date.now(),
      ...jobData
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    const position = this.queue.indexOf(jobId);
    const queueLength = this.queue.length;
    const estimatedWaitTime = position * this.estimatedTimePerJob;

    console.log(`[ImageEditQueue] Job ${jobId} added to queue at position ${position + 1}`);

    // Start processing if not already processing
    if (!this.processing) {
      this.processQueue();
    }

    return {
      jobId,
      status: 'queued',
      position: position + 1,
      queueLength,
      estimatedWaitTime,
      message: 'Job added to queue successfully'
    };
  }

  /**
   * Get current status of a job
   * @param {string} jobId - Job identifier
   * @returns {object} Job status information
   */
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      return {
        jobId,
        status: 'not_found',
        error: 'Job not found'
      };
    }

    const response = {
      jobId,
      status: job.status,
      createdAt: job.createdAt
    };

    // Add position if queued
    if (job.status === 'queued') {
      const position = this.queue.indexOf(jobId);
      if (position !== -1) {
        response.position = position + 1;
        response.queueLength = this.queue.length;
        response.estimatedWaitTime = position * this.estimatedTimePerJob;
      }
    }

    // Add processing info
    if (job.status === 'processing') {
      response.startedAt = job.startedAt;
      response.runningTime = Date.now() - job.startedAt;
    }

    // Add result if completed
    if (job.status === 'completed') {
      response.result = job.result;
      response.completedAt = job.completedAt;
      response.processingTime = job.processingTime;
    }

    // Add error if failed
    if (job.status === 'failed') {
      response.error = job.error;
      response.failedAt = job.failedAt;
    }

    return response;
  }

  /**
   * Get queue statistics
   * @returns {object} Queue stats
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentJob: this.currentJob ? {
        jobId: this.currentJob.jobId,
        userId: this.currentJob.userId,
        startedAt: this.currentJob.startedAt,
        runningTime: Date.now() - this.currentJob.startedAt
      } : null,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      totalInQueue: this.jobs.size
    };
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job to cancel
   * @returns {boolean} Success status
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      return false;
    }

    // Can only cancel queued jobs
    if (job.status === 'queued') {
      const index = this.queue.indexOf(jobId);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }
      job.status = 'cancelled';
      job.cancelledAt = Date.now();
      console.log(`[ImageEditQueue] Job ${jobId} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Process the queue sequentially
   */
  async processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);

      if (!job) {
        continue;
      }

      console.log(`[ImageEditQueue] Processing job ${jobId} (${this.queue.length} remaining in queue)`);

      this.currentJob = job;
      job.status = 'processing';
      job.startedAt = Date.now();

      try {
        // Execute the processor function with timeout
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        const result = await Promise.race([
          job.processor(job),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Job timeout after 5 minutes')), timeoutMs)
          )
        ]);

        job.status = 'completed';
        job.result = result;
        job.completedAt = Date.now();
        job.processingTime = job.completedAt - job.startedAt;
        this.completedCount++;

        console.log(`[ImageEditQueue] ✓ Job ${jobId} completed in ${job.processingTime}ms`);

        // Cleanup after 1 hour
        setTimeout(() => {
          this.jobs.delete(jobId);
          console.log(`[ImageEditQueue] Cleaned up completed job ${jobId}`);
        }, 60 * 60 * 1000);

      } catch (error) {
        job.status = 'failed';
        job.error = error.message;
        job.failedAt = Date.now();
        this.failedCount++;

        console.error(`[ImageEditQueue] ✗ Job ${jobId} failed:`, error.message);

        // Cleanup failed jobs after 1 hour
        setTimeout(() => {
          this.jobs.delete(jobId);
          console.log(`[ImageEditQueue] Cleaned up failed job ${jobId}`);
        }, 60 * 60 * 1000);
      }

      this.currentJob = null;
    }

    this.processing = false;
    console.log('[ImageEditQueue] Queue is empty');
  }
}

// Export singleton instance
module.exports = new ImageEditQueueService();
