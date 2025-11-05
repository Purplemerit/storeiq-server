/**
 * Test script for Veo video generation with model selection
 * Run: node test-veo.js [modelType]
 * Example: node test-veo.js fast
 */

const { generateVideoAndWait, downloadVideoFromGCS } = require('./src/geminiService');
const fs = require('fs');
const path = require('path');

// Get model type from command line argument or use default
const modelType = process.argv[2] || 'standard';
const validModels = ['standard', 'fast', 'v2'];

if (!validModels.includes(modelType)) {
  console.error(`❌ Invalid model type: ${modelType}`);
  console.error(`   Valid options: ${validModels.join(', ')}`);
  process.exit(1);
}

console.log(`🎬 Testing Veo Video Generation with "${modelType}" model...\n`);

async function testVideoGeneration() {
  try {
    console.log('Starting video generation with automatic polling...');
    const prompt = 'A happy cat playing with a ball of yarn in a sunny room';
    
    // Generate video and wait for completion
    const result = await generateVideoAndWait(prompt, {
      resolution: '720p',
      sampleCount: 1,
      generateAudio: true,
      modelType: modelType
    }, {
      maxAttempts: 60,      // 5 minutes max
      pollInterval: 5000    // Check every 5 seconds
    });

    // Check if it's mock mode (model not enabled)
    if (result.mock) {
      console.log('\n⚠️  MOCK MODE');
      console.log('Message:', result.message);
      console.log('Mock Video URL:', result.videoUrl);
      console.log('\n💡 To enable real video generation:');
      console.log('   1. Go to: https://console.cloud.google.com/vertex-ai/model-garden');
      console.log('   2. Search for "Veo"');
      console.log('   3. Click "Enable" on Veo 3.0 model');
      return;
    }

    console.log('\n\n✅ VIDEO GENERATION COMPLETED!');
    console.log(`Generated ${result.videos.length} video(s):`);
    
    // Process each video
    for (let i = 0; i < result.videos.length; i++) {
      const video = result.videos[i];
      console.log(`\nVideo ${i + 1}:`);
      console.log('  Type:', video.type);
      console.log('  MIME Type:', video.mimeType);
      
      if (video.type === 'gcs') {
        console.log('  GCS URL:', video.url);
        
        // Optionally download the video
        try {
          console.log('  Downloading video...');
          const videoBuffer = await downloadVideoFromGCS(video.url);
          
          // Save to local file
          const outputDir = path.join(__dirname, 'output');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          const timestamp = Date.now();
          const filename = `veo_video_${modelType}_${timestamp}_${i + 1}.mp4`;
          const filepath = path.join(outputDir, filename);
          
          fs.writeFileSync(filepath, videoBuffer);
          console.log('  ✓ Downloaded to:', filepath);
          console.log('  Size:', (videoBuffer.length / 1024 / 1024).toFixed(2), 'MB');
        } catch (downloadErr) {
          console.error('  ✗ Download failed:', downloadErr.message);
        }
      } else if (video.type === 'base64') {
        console.log('  Video data: base64 encoded');
        console.log('  Size:', (video.videoData.length / 1024 / 1024).toFixed(2), 'MB (encoded)');
        
        // Save base64 video
        try {
          const outputDir = path.join(__dirname, 'output');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          const timestamp = Date.now();
          const filename = `veo_video_${modelType}_${timestamp}_${i + 1}.mp4`;
          const filepath = path.join(outputDir, filename);
          
          const buffer = Buffer.from(video.videoData, 'base64');
          fs.writeFileSync(filepath, buffer);
          console.log('  ✓ Saved to:', filepath);
          console.log('  Size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');
        } catch (saveErr) {
          console.error('  ✗ Save failed:', saveErr.message);
        }
      }
    }
    
    console.log('\n✨ All videos processed successfully!');
    return result;
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    // Parse error if it's JSON
    try {
      const errorDetails = JSON.parse(error.message);
      console.error('\nError Details:');
      console.error('Status:', errorDetails.status);
      console.error('Message:', errorDetails.message);
      if (errorDetails.details) {
        console.error('Details:', JSON.stringify(errorDetails.details, null, 2));
      }
    } catch (e) {
      // Not JSON, already logged
    }
    
    throw error;
  }
}

// Run the test
console.log('═'.repeat(60));
console.log(`📊 Configuration:`);
console.log(`   Model Type: ${modelType.toUpperCase()}`);
console.log(`   Project: ${process.env.GCP_PROJECT_ID || 'Not configured'}`);
console.log(`   Location: ${process.env.GCP_LOCATION || 'Not configured'}`);
console.log('═'.repeat(60));
console.log();

testVideoGeneration()
  .then(() => {
    console.log('\n✨ Test complete!');
    console.log('\n💡 Usage:');
    console.log('   node test-veo.js           # Use default (standard)');
    console.log('   node test-veo.js standard  # High quality');
    console.log('   node test-veo.js fast      # Faster generation');
    console.log('   node test-veo.js v2        # Older version');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  });
