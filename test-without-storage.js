/**
 * Test Veo without storageUri (base64 response instead of GCS)
 * This might work if the GCS bucket is causing issues
 */

const { generateVideoAndWait } = require('./src/geminiService');

console.log('🧪 Testing Veo WITHOUT storageUri parameter\n');
console.log('This will return base64 video data instead of GCS URL\n');
console.log('═'.repeat(70));

async function testWithoutStorage() {
  try {
    console.log('\n📝 Test: Simple ocean prompt without storage URI');
    console.log('-'.repeat(70));
    
    const result = await generateVideoAndWait(
      'A calm blue ocean with gentle waves',
      {
        resolution: '720p',
        sampleCount: 1,
        storageUri: null,  // Explicitly null - no GCS storage, get base64 response
        autoImprovePrompt: false
      },
      {
        maxRetries: 0,  // No retries for this test
        maxAttempts: 60,
        pollInterval: 5000
      }
    );
    
    if (result.mock) {
      console.log('⚠️  Mock mode:', result.message);
    } else if (result.status === 'COMPLETED') {
      console.log('\n✅ SUCCESS! Video generated');
      console.log('Videos:', result.videos);
      
      if (result.videos?.[0]?.type === 'base64') {
        const base64Length = result.videos[0].videoData?.length || 0;
        console.log(`Base64 video data length: ${base64Length} characters`);
        console.log('You can decode this to get the video file');
      }
    }
  } catch (err) {
    console.error('\n❌ Failed:', err.message);
    
    if (err.message.includes('code": 13')) {
      console.log('\n🔍 Analysis:');
      console.log('Error code 13 persists even without GCS bucket.');
      console.log('This eliminates bucket permissions as the cause.\n');
      console.log('📋 Most Likely Cause:');
      console.log('Your GCP project needs to be ALLOWLISTED for Veo API access.\n');
      console.log('✅ Solution:');
      console.log('1. The model works in Vertex AI Studio (UI)');
      console.log('2. But fails via programmatic API');
      console.log('3. This is typical for preview/GA models with restricted API access\n');
      console.log('📧 Contact Google Cloud Support:');
      console.log('   Subject: "Request Veo 3.0 Programmatic API Access"');
      console.log('   Message: "Video generation works in Vertex AI Studio but');
      console.log('            API requests fail with error code 13. Please');
      console.log('            allowlist project for Veo API access."');
      console.log(`   Project ID: veo-video-generator-477310`);
    }
  }
}

testWithoutStorage();
