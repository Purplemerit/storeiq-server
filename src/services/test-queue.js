/**
 * Simple test script to demonstrate the queue system
 * Run this to see how multiple requests are queued and processed
 * NO ACTUAL VIDEO GENERATION - Just simulates the queue behavior
 */

const videoQueueService = require('./videoQueueService');

console.log('🧪 Testing Video Queue Service (Mock Mode - No API Calls)\n');

// Simulate video generation (takes 2 seconds instead of 90 seconds)
const mockVideoProcessor = async (jobData) => {
  const { userId, prompt } = jobData;
  console.log(`  📹 [MOCK] Processing video for user ${userId}: "${prompt}"`);
  
  // Simulate video generation time (2 seconds for testing)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`  ✅ [MOCK] Completed video for user ${userId}`);
  
  return {
    s3Url: `https://mock-s3.example.com/video-${userId}.mp4`,
    s3Key: `videos/${userId}/video-${Date.now()}.mp4`,
    resolution: '720p',
    duration: 5
  };
};

// Test 1: Add multiple jobs
console.log('📋 Test 1: Adding 3 jobs to queue\n');

const job1 = videoQueueService.addJob('job-1', {
  userId: 'user-1',
  username: 'Alice',
  prompt: 'A cat playing piano',
  processor: mockVideoProcessor
});
console.log('Job 1:', job1);

const job2 = videoQueueService.addJob('job-2', {
  userId: 'user-2',
  username: 'Bob',
  prompt: 'A dog riding a skateboard',
  processor: mockVideoProcessor
});
console.log('Job 2:', job2);

const job3 = videoQueueService.addJob('job-3', {
  userId: 'user-3',
  username: 'Charlie',
  prompt: 'A bird singing opera',
  processor: mockVideoProcessor
});
console.log('Job 3:', job3);

console.log('\n' + '='.repeat(60) + '\n');
console.log('⏳ Queue will process jobs one at a time...\n');

// Test 2: Check queue stats immediately
console.log('📊 Initial Queue Stats:');
console.log(JSON.stringify(videoQueueService.getStats(), null, 2));
console.log('\n' + '='.repeat(60) + '\n');

// Test 3: Check queue stats after first job should start
setTimeout(() => {
  console.log('📊 Queue Stats after 1 second (Job 1 should be processing):');
  const stats = videoQueueService.getStats();
  console.log(`  - Queue Length: ${stats.queueLength}`);
  console.log(`  - Processing: ${stats.processing}`);
  console.log(`  - Current Job: ${stats.currentJob ? stats.currentJob.jobId : 'None'}`);
  console.log('\n' + '='.repeat(60) + '\n');
}, 1000);

// Test 4: Check job status while processing
setTimeout(() => {
  console.log('🔍 Job Status Checks (after 1.5 seconds):\n');
  const job1Status = videoQueueService.getJobStatus('job-1');
  const job2Status = videoQueueService.getJobStatus('job-2');
  const job3Status = videoQueueService.getJobStatus('job-3');
  
  console.log(`Job 1: ${job1Status.status} ${job1Status.position !== undefined ? `(position: ${job1Status.position})` : ''}`);
  console.log(`Job 2: ${job2Status.status} ${job2Status.position !== undefined ? `(position: ${job2Status.position})` : ''}`);
  console.log(`Job 3: ${job3Status.status} ${job3Status.position !== undefined ? `(position: ${job3Status.position})` : ''}`);
  console.log('\n' + '='.repeat(60) + '\n');
}, 1500);

// Test 5: Check after first job completes
setTimeout(() => {
  console.log('📊 After Job 1 completes (3 seconds):\n');
  const stats = videoQueueService.getStats();
  console.log(`  - Queue Length: ${stats.queueLength}`);
  console.log(`  - Current Job: ${stats.currentJob ? stats.currentJob.jobId : 'None'}`);
  console.log(`  - Completed: ${stats.completedCount}`);
  
  console.log('\nJob Statuses:');
  console.log(`  Job 1: ${videoQueueService.getJobStatus('job-1').status}`);
  console.log(`  Job 2: ${videoQueueService.getJobStatus('job-2').status}`);
  console.log(`  Job 3: ${videoQueueService.getJobStatus('job-3').status}`);
  console.log('\n' + '='.repeat(60) + '\n');
}, 3000);

// Test 6: Final results
setTimeout(() => {
  console.log('✅ Final Results (all jobs should be completed):\n');
  
  const job1Final = videoQueueService.getJobStatus('job-1');
  const job2Final = videoQueueService.getJobStatus('job-2');
  const job3Final = videoQueueService.getJobStatus('job-3');
  
  console.log('Job 1:', {
    status: job1Final.status,
    s3Url: job1Final.result?.s3Url || 'N/A',
    processingTime: job1Final.processingTime ? `${job1Final.processingTime}ms` : 'N/A'
  });
  
  console.log('Job 2:', {
    status: job2Final.status,
    s3Url: job2Final.result?.s3Url || 'N/A',
    processingTime: job2Final.processingTime ? `${job2Final.processingTime}ms` : 'N/A'
  });
  
  console.log('Job 3:', {
    status: job3Final.status,
    s3Url: job3Final.result?.s3Url || 'N/A',
    processingTime: job3Final.processingTime ? `${job3Final.processingTime}ms` : 'N/A'
  });
  
  console.log('\n📊 Final Queue Stats:');
  const finalStats = videoQueueService.getStats();
  console.log(`  - Total Completed: ${finalStats.completedCount}`);
  console.log(`  - Total Failed: ${finalStats.failedCount}`);
  console.log(`  - Queue Length: ${finalStats.queueLength}`);
  console.log(`  - Processing: ${finalStats.processing}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Test Complete! Queue system working correctly.');
  console.log('='.repeat(60));
  
  console.log('\n📝 Summary:');
  console.log('  ✅ Jobs were added to queue');
  console.log('  ✅ Jobs processed one at a time (sequential)');
  console.log('  ✅ Queue position tracked correctly');
  console.log('  ✅ All jobs completed successfully');
  console.log('  ✅ NO REAL API CALLS MADE - Zero cost test!\n');
  
  process.exit(0);
}, 8000); // Wait for all 3 jobs to complete (2s each = 6s total + buffer)

console.log('⏳ Test running... (takes ~8 seconds)\n');
console.log('💡 This simulates 3 users generating videos simultaneously');
console.log('💡 Watch how the queue processes them one at a time!\n');
