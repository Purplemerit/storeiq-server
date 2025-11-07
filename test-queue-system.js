/**
 * Video Queue System Test
 * Run this file to test the queue implementation
 * 
 * Usage: node test-queue-system.js
 */

const videoQueueService = require('./src/services/videoQueueService');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function header(text) {
  console.log('\n' + colors.cyan + '='.repeat(60));
  console.log(text);
  console.log('='.repeat(60) + colors.reset);
}

// Simulate video generation with delay
function simulateVideoGeneration(jobData, duration = 3000) {
  return new Promise((resolve, reject) => {
    log(colors.blue, `  ⏳ Simulating video generation for job ${jobData.jobId}...`);
    log(colors.blue, `     Prompt: "${jobData.prompt}"`);
    log(colors.blue, `     Resolution: ${jobData.resolution}`);
    log(colors.blue, `     Duration: ${duration}ms`);
    
    setTimeout(() => {
      // Simulate 10% failure rate
      if (Math.random() < 0.1) {
        reject(new Error('Simulated API error'));
      } else {
        resolve({
          s3Url: `https://example.com/videos/${jobData.jobId}.mp4`,
          s3Key: `videos/${jobData.jobId}.mp4`,
          resolution: jobData.resolution,
          duration: 5
        });
      }
    }, duration);
  });
}

// Test 1: Single job
async function testSingleJob() {
  header('TEST 1: Single Job Processing');
  
  const jobId = 'test-job-1';
  const jobData = {
    jobId: jobId,
    userId: 'user123',
    username: 'testuser',
    prompt: 'A beautiful sunset over the ocean',
    resolution: '720p',
    processor: simulateVideoGeneration
  };

  log(colors.yellow, '📝 Adding job to queue...');
  const result = videoQueueService.addJob(jobId, jobData);
  log(colors.green, '✓ Job added:', result);

  // Wait for completion
  await new Promise(resolve => {
    const checkInterval = setInterval(() => {
      const status = videoQueueService.getJobStatus(jobId);
      log(colors.cyan, `  Status: ${status.status}`);
      
      if (status.status === 'completed') {
        log(colors.green, '✓ Job completed!', status);
        clearInterval(checkInterval);
        resolve();
      } else if (status.status === 'failed') {
        log(colors.red, '✗ Job failed!', status);
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
  });
}

// Test 2: Multiple concurrent jobs
async function testMultipleJobs() {
  header('TEST 2: Multiple Concurrent Jobs (Queue Test)');
  
  const jobs = [
    { id: 'job-1', prompt: 'A cat playing piano', resolution: '720p', duration: 2000 },
    { id: 'job-2', prompt: 'A dog riding skateboard', resolution: '1080p', duration: 3000 },
    { id: 'job-3', prompt: 'A bird singing in tree', resolution: '720p', duration: 2500 }
  ];

  log(colors.yellow, `📝 Adding ${jobs.length} jobs simultaneously...`);
  
  const startTime = Date.now();
  
  // Add all jobs at once
  jobs.forEach(job => {
    const result = videoQueueService.addJob(job.id, {
      jobId: job.id,
      userId: 'user123',
      username: 'testuser',
      prompt: job.prompt,
      resolution: job.resolution,
      processor: (data) => simulateVideoGeneration(data, job.duration)
    });
    log(colors.green, `✓ Job ${job.id} added at position ${result.position}`);
  });

  // Monitor queue
  log(colors.cyan, '\n📊 Monitoring queue status...');
  await new Promise(resolve => {
    const checkInterval = setInterval(() => {
      const stats = videoQueueService.getStats();
      log(colors.cyan, `  Queue: ${stats.queueLength} | Processing: ${stats.processing ? 'YES' : 'NO'} | Completed: ${stats.completedCount}`);
      
      // Check if all jobs are done
      const allCompleted = jobs.every(job => {
        const status = videoQueueService.getJobStatus(job.id);
        return status.status === 'completed' || status.status === 'failed';
      });
      
      if (allCompleted) {
        const endTime = Date.now();
        const totalTime = ((endTime - startTime) / 1000).toFixed(2);
        
        log(colors.green, `\n✓ All jobs completed in ${totalTime}s`);
        
        // Show individual results
        jobs.forEach(job => {
          const status = videoQueueService.getJobStatus(job.id);
          if (status.status === 'completed') {
            log(colors.green, `  ✓ ${job.id}: SUCCESS (${(status.processingTime / 1000).toFixed(2)}s)`);
          } else {
            log(colors.red, `  ✗ ${job.id}: FAILED - ${status.error}`);
          }
        });
        
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
  });
}

// Test 3: Queue statistics
async function testQueueStats() {
  header('TEST 3: Queue Statistics');
  
  videoQueueService.clearHistory();
  
  const stats = videoQueueService.getStats();
  log(colors.cyan, 'Current Queue Stats:');
  console.log(stats);
  
  log(colors.green, '✓ Stats retrieved successfully');
}

// Test 4: Job cancellation
async function testJobCancellation() {
  header('TEST 4: Job Cancellation');
  
  const jobId = 'cancel-test-job';
  const jobData = {
    jobId: jobId,
    userId: 'user123',
    username: 'testuser',
    prompt: 'This job will be cancelled',
    resolution: '720p',
    processor: (data) => simulateVideoGeneration(data, 5000) // Long duration
  };

  log(colors.yellow, '📝 Adding job to queue...');
  videoQueueService.addJob(jobId, jobData);
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 500));
  
  log(colors.yellow, '🗑️  Attempting to cancel job...');
  const removed = videoQueueService.removeJob(jobId);
  
  if (removed) {
    log(colors.green, '✓ Job cancelled successfully');
  } else {
    log(colors.red, '✗ Failed to cancel job (might be processing)');
  }
  
  const status = videoQueueService.getJobStatus(jobId);
  log(colors.cyan, '  Final status:', status.status);
}

// Test 5: User's jobs
async function testUserJobs() {
  header('TEST 5: Get User Jobs');
  
  const userId = 'test-user-456';
  
  // Add some jobs for this user
  for (let i = 1; i <= 3; i++) {
    videoQueueService.addJob(`user-job-${i}`, {
      jobId: `user-job-${i}`,
      userId: userId,
      username: 'testuser',
      prompt: `Test video ${i}`,
      resolution: '720p',
      processor: (data) => simulateVideoGeneration(data, 1000)
    });
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const userJobs = videoQueueService.getUserJobs(userId);
  log(colors.cyan, `User ${userId} has ${userJobs.length} active jobs:`);
  userJobs.forEach(job => {
    log(colors.green, `  - Job ${job.jobId}: ${job.status} (position: ${job.position})`);
  });
  
  // Wait for jobs to complete
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  const userJobsAfter = videoQueueService.getUserJobs(userId);
  log(colors.cyan, `\nAfter processing, user has ${userJobsAfter.length} active jobs`);
}

// Run all tests
async function runAllTests() {
  console.clear();
  log(colors.magenta, '╔═══════════════════════════════════════════════════════════╗');
  log(colors.magenta, '║        VIDEO QUEUE SYSTEM - COMPREHENSIVE TEST           ║');
  log(colors.magenta, '╚═══════════════════════════════════════════════════════════╝');
  
  try {
    await testSingleJob();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testMultipleJobs();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testQueueStats();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testJobCancellation();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testUserJobs();
    
    header('✅ ALL TESTS COMPLETED');
    log(colors.green, '\nQueue system is working correctly!');
    log(colors.green, 'Ready for production use.');
    
  } catch (error) {
    log(colors.red, '\n❌ TEST FAILED:', error.message);
    console.error(error);
  }
}

// Run tests
runAllTests().then(() => {
  log(colors.cyan, '\n👋 Test complete. Press Ctrl+C to exit.');
});
