/**
 * Test Veo with the simplest, safest prompts that should definitely work
 * These prompts are known to pass content filters
 */

const { generateVideoAndWait } = require('./src/geminiService');

// Ultra-safe prompts that should work if the API is functioning
const testPrompts = [
  'A calm blue ocean with gentle waves',
  'Green forest with trees and sunlight',
  'White clouds moving slowly across blue sky',
  'A red ball rolling on grass',
  'Yellow flowers swaying in breeze'
];

console.log('🧪 Testing Veo-3 with ultra-simple prompts');
console.log('These prompts are designed to pass all content filters\n');
console.log('═'.repeat(70));

async function testSimplePrompts() {
  for (let i = 0; i < testPrompts.length; i++) {
    const prompt = testPrompts[i];
    console.log(`\n📝 Test ${i + 1}/${testPrompts.length}: "${prompt}"`);
    console.log('-'.repeat(70));
    
    try {
      const result = await generateVideoAndWait(prompt, {
        resolution: '720p',
        sampleCount: 1,
        autoImprovePrompt: false  // Use prompt as-is
      }, {
        maxRetries: 0,  // No retries for this test
        maxAttempts: 60,
        pollInterval: 5000
      });
      
      if (result.mock) {
        console.log('⚠️  Mock mode:', result.message);
        console.log('Stopping tests - configuration issue detected');
        break;
      } else if (result.status === 'COMPLETED') {
        console.log('✅ SUCCESS! Video generated');
        console.log('Video URL:', result.videos?.[0]?.url || 'N/A');
        console.log('\n🎉 Veo is working! The issue was with the prompt complexity.');
        console.log('\nRecommendation: Use simpler, more direct visual descriptions.');
        break;
      }
    } catch (err) {
      const errorMsg = err.message;
      
      if (errorMsg.includes('code": 13') || errorMsg.includes('Internal error')) {
        console.log('❌ Error code 13 - Internal error');
        
        if (i === testPrompts.length - 1) {
          console.log('\n🚨 CRITICAL: All simple prompts failed with error code 13');
          console.log('This indicates a systemic issue, NOT a prompt problem.\n');
          console.log('Most likely causes:');
          console.log('  1. Regional availability - Veo may not be available in us-central1');
          console.log('  2. Model enablement - Veo may not be enabled in Model Garden');
          console.log('  3. Service outage - Temporary Google Cloud issue');
          console.log('\n📋 Action items:');
          console.log('  1. Try a different region:');
          console.log('     → Update GCP_LOCATION=us-east4 in .env');
          console.log('     → Update GCP_LOCATION=europe-west4 in .env');
          console.log('  2. Check Model Garden:');
          console.log('     → https://console.cloud.google.com/vertex-ai/model-garden');
          console.log('     → Search "Veo 3" and verify it\'s enabled');
          console.log('  3. Check service status:');
          console.log('     → https://status.cloud.google.com/');
          console.log('  4. Check project quotas:');
          console.log('     → https://console.cloud.google.com/iam-admin/quotas');
        } else {
          console.log('Trying next prompt...');
        }
      } else if (errorMsg.includes('code": 7') || errorMsg.includes('permission')) {
        console.log('❌ Permission denied');
        console.log('Run: node diagnose-veo.js');
        break;
      } else if (errorMsg.includes('code": 404')) {
        console.log('❌ Model not found');
        console.log('The Veo model may not be available in your region.');
        console.log('Try: GCP_LOCATION=us-east4 in .env');
        break;
      } else {
        console.log('❌ Error:', errorMsg.substring(0, 200));
      }
      
      // Small delay between attempts
      if (i < testPrompts.length - 1) {
        console.log('Waiting 5 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('Test complete');
}

// Run tests
testSimplePrompts().catch(err => {
  console.error('\n❌ Test script failed:', err.message);
  process.exit(1);
});
