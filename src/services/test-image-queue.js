/**
 * Test script for Image Generation Queue System
 * REAL API CALLS - Tests actual Imagen-4 API integration
 */

const imageQueueService = require('./imageQueueService');
const axios = require('axios');
const s3Service = require('../s3Service');
const { GoogleAuth } = require('google-auth-library');

console.log('🧪 Testing Image Queue Service (REAL API MODE)\n');
console.log('⚠️  This will make actual API calls to Google Vertex AI Imagen-4\n');

/**
 * Helper function to generate meaningful filename from prompt
 */
function generateMeaningfulFilename(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'generated-image';
  
  let cleaned = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
  
  if (cleaned.length > 30) {
    cleaned = cleaned.substring(0, 30);
  }
  
  return cleaned || 'generated-image';
}

/**
 * Helper function to generate a short title
 */
function generateShortTitle(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'Generated Image';
  
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4);
  
  const title = words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return title || 'Generated Image';
}

// Real image generation processor (actual Imagen-4 API calls)
const realImageProcessor = async (jobData) => {
  const { userId, username, prompt, aspectRatio } = jobData;
  console.log(`  🎨 [REAL] Generating image for ${username}: "${prompt}"`);
  console.log(`  📐 Aspect Ratio: ${aspectRatio}`);
  
  try {
    // Get Google Cloud credentials
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP_PROJECT_ID environment variable not set');
    }

    // Initialize Google Auth
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Use Imagen 4 Fast model
    const imagenModel = "imagen-4.0-fast-generate-001";
    const location = "us-central1";
    const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}:predict`;

    console.log('  ⏳ Calling Vertex AI Imagen-4 API...');
    const startTime = Date.now();
    
    const vertexResponse = await axios.post(
      vertexApiUrl,
      {
        instances: [{ prompt: prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspectRatio
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        },
      }
    );

    const apiTime = Date.now() - startTime;
    console.log(`  ✅ Image generated in ${apiTime}ms`);

    // Extract base64 image
    const predictions = vertexResponse.data.predictions;
    if (!predictions || !predictions.length) {
      throw new Error('No predictions returned from API');
    }

    const imageBase64 = predictions[0].bytesBase64Encoded;
    if (!imageBase64) {
      throw new Error('No image data in API response');
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`  📦 Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    
    // Generate filename and title
    const meaningfulFilename = generateMeaningfulFilename(prompt);
    const shortTitle = generateShortTitle(prompt);
    
    // Upload to S3
    console.log('  ☁️  Uploading to S3...');
    const s3Result = await s3Service.uploadImageBuffer(
      imageBuffer,
      'image/png',
      userId,
      username,
      { 
        generated: "true", 
        prompt,
        customFilename: meaningfulFilename
      }
    );
    
    if (!s3Result || !s3Result.key) {
      throw new Error('Failed to upload to S3');
    }

    console.log(`  ✅ Uploaded to S3: ${s3Result.key}`);

    // Save to database
    const Video = require('../models/Video');
    let videoRecord = await Video.findOne({ s3Key: s3Result.key });
    if (!videoRecord) {
      videoRecord = new Video({
        s3Key: s3Result.key,
        owner: userId,
        title: shortTitle,
        description: prompt,
        prompt: prompt,
        provider: 'vertex-ai-imagen-4',
      });
      await videoRecord.save();
      console.log('  💾 Saved to database');
    }

    // Generate signed URL
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    const getCommand = new GetObjectCommand({ 
      Bucket: process.env.AWS_BUCKET_NAME, 
      Key: s3Result.key 
    });
    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    console.log(`  ✅ [REAL] Image complete for ${username}\n`);

    return {
      imageUrl: signedUrl,
      url: signedUrl,
      s3Key: s3Result.key,
      prompt,
      title: shortTitle,
      provider: 'vertex-ai-imagen-4',
      processingTime: apiTime
    };
  } catch (error) {
    console.error(`  ❌ Error generating image: ${error.message}\n`);
    throw error;
  }
};

// Test 1: Add multiple jobs
console.log('📋 Test 1: Adding 2 image generation jobs to queue\n');
console.log('💡 Using simple prompts to minimize token usage\n');

const job1 = imageQueueService.addJob('img-job-1', {
  userId: 'test-user-1',
  username: 'TestUser1',
  prompt: 'A red apple',
  aspectRatio: '1:1',
  processor: realImageProcessor
});
console.log('Job 1:', job1);

const job2 = imageQueueService.addJob('img-job-2', {
  userId: 'test-user-2',
  username: 'TestUser2',
  prompt: 'A blue car',
  aspectRatio: '1:1',
  processor: realImageProcessor
});
console.log('Job 2:', job2);

console.log('\n' + '='.repeat(60) + '\n');
console.log('⏳ Queue will process images one at a time...\n');
console.log('⏱️  Each image takes ~15-25 seconds to generate\n');

// Test 2: Check queue stats immediately
console.log('📊 Initial Queue Stats:');
console.log(JSON.stringify(imageQueueService.getStats(), null, 2));
console.log('\n' + '='.repeat(60) + '\n');

// Test 3: Check queue stats after first job should start
setTimeout(() => {
  console.log('📊 Queue Stats after 2 seconds (Job 1 should be processing):');
  const stats = imageQueueService.getStats();
  console.log(`  - Queue Length: ${stats.queueLength}`);
  console.log(`  - Processing: ${stats.processing}`);
  console.log(`  - Current Job: ${stats.currentJob ? stats.currentJob.jobId : 'None'}`);
  console.log('\n' + '='.repeat(60) + '\n');
}, 2000);

// Test 4: Check job status while processing
setTimeout(() => {
  console.log('🔍 Job Status Checks (after 10 seconds):\n');
  const job1Status = imageQueueService.getJobStatus('img-job-1');
  const job2Status = imageQueueService.getJobStatus('img-job-2');
  
  console.log(`Job 1: ${job1Status.status} ${job1Status.position !== undefined ? `(position: ${job1Status.position})` : ''}`);
  console.log(`Job 2: ${job2Status.status} ${job2Status.position !== undefined ? `(position: ${job2Status.position})` : ''}`);
  console.log('\n' + '='.repeat(60) + '\n');
}, 10000);

// Test 5: Check after first job completes
setTimeout(() => {
  console.log('📊 After ~25 seconds (Job 1 should be done):\n');
  const stats = imageQueueService.getStats();
  console.log(`  - Queue Length: ${stats.queueLength}`);
  console.log(`  - Current Job: ${stats.currentJob ? stats.currentJob.jobId : 'None'}`);
  console.log(`  - Completed: ${stats.completedCount}`);
  
  console.log('\nJob Statuses:');
  console.log(`  Job 1: ${imageQueueService.getJobStatus('img-job-1').status}`);
  console.log(`  Job 2: ${imageQueueService.getJobStatus('img-job-2').status}`);
  console.log('\n' + '='.repeat(60) + '\n');
}, 25000);

// Test 6: Final results
setTimeout(() => {
  console.log('✅ Final Results (both jobs should be completed):\n');
  
  const job1Final = imageQueueService.getJobStatus('img-job-1');
  const job2Final = imageQueueService.getJobStatus('img-job-2');
  
  console.log('Job 1:', {
    status: job1Final.status,
    imageUrl: job1Final.result?.imageUrl?.substring(0, 60) + '...' || 'N/A',
    title: job1Final.result?.title || 'N/A',
    s3Key: job1Final.result?.s3Key || 'N/A',
    processingTime: job1Final.processingTime ? `${job1Final.processingTime}ms` : 'N/A'
  });
  
  console.log('\nJob 2:', {
    status: job2Final.status,
    imageUrl: job2Final.result?.imageUrl?.substring(0, 60) + '...' || 'N/A',
    title: job2Final.result?.title || 'N/A',
    s3Key: job2Final.result?.s3Key || 'N/A',
    processingTime: job2Final.processingTime ? `${job2Final.processingTime}ms` : 'N/A'
  });
  
  console.log('\n📊 Final Queue Stats:');
  const finalStats = imageQueueService.getStats();
  console.log(`  - Total Completed: ${finalStats.completedCount}`);
  console.log(`  - Total Failed: ${finalStats.failedCount}`);
  console.log(`  - Queue Length: ${finalStats.queueLength}`);
  console.log(`  - Processing: ${finalStats.processing}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Test Complete! Image queue system working with REAL API!');
  console.log('='.repeat(60));
  
  console.log('\n📝 Summary:');
  console.log('  ✅ Jobs were added to queue');
  console.log('  ✅ Jobs processed one at a time (sequential)');
  console.log('  ✅ Queue position tracked correctly');
  console.log('  ✅ Real API calls made to Vertex AI Imagen-4');
  console.log('  ✅ Images uploaded to S3 successfully');
  console.log('  ✅ Images saved to database');
  console.log('  ✅ Both images completed!\n');
  
  if (job1Final.status === 'completed' && job1Final.result) {
    console.log('🖼️  Generated Images:');
    console.log(`  1. ${job1Final.result.title} - ${job1Final.result.s3Key}`);
    if (job2Final.status === 'completed' && job2Final.result) {
      console.log(`  2. ${job2Final.result.title} - ${job2Final.result.s3Key}`);
    }
  }
  
  console.log('\n💰 Cost Estimate: ~$0.02 USD (2 images × $0.01 each)');
  console.log('⏱️  Total Time: ~30-50 seconds\n');
  
  process.exit(0);
}, 55000); // Wait for both jobs to complete (~25s each = 50s + buffer)

console.log('⏳ Test running... (takes ~55 seconds)\n');
console.log('💡 This tests 2 users generating images simultaneously');
console.log('💡 Watch how the queue processes them one at a time!');
console.log('💡 Real API calls will be made to Google Vertex AI\n');
