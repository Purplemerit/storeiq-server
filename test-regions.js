/**
 * Test different regions to find which one has Veo-3 available
 */

const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// Regions to test (based on Google's documentation)
const REGIONS_TO_TEST = [
  'us-central1',     // Default region
  'us-east4',        // Alternative US region
  'us-west1',        // West coast US
  'europe-west4',    // Europe (Netherlands)
  'europe-west1',    // Europe (Belgium)
  'asia-southeast1', // Singapore
  'asia-northeast1'  // Tokyo
];

console.log('🌍 Testing Veo-3 availability across regions');
console.log('Project:', GCP_PROJECT_ID);
console.log('═'.repeat(70));

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function testRegion(region) {
  try {
    const accessToken = await getAccessToken();
    
    // Try a minimal video generation request
    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${region}/publishers/google/models/veo-3.0-generate-preview:predictLongRunning`;
    
    const payload = {
      instances: [{ prompt: "A calm ocean" }],
      parameters: {
        sampleCount: 1,
        resolution: '720p'
      }
    };
    
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.status === 200 && response.data.name) {
      return { 
        success: true, 
        operationId: response.data.name.split('/').pop()
      };
    }
    
    return { success: false, error: 'No operation returned' };
    
  } catch (err) {
    if (err.response) {
      return {
        success: false,
        statusCode: err.response.status,
        error: err.response.data?.error?.message || err.response.statusText
      };
    }
    return {
      success: false,
      error: err.message
    };
  }
}

async function testAllRegions() {
  const results = [];
  
  for (const region of REGIONS_TO_TEST) {
    process.stdout.write(`\nTesting ${region.padEnd(20)} ... `);
    
    const result = await testRegion(region);
    results.push({ region, ...result });
    
    if (result.success) {
      console.log('✅ AVAILABLE (Operation started)');
    } else if (result.statusCode === 404) {
      console.log('❌ Not Found (Model not available in this region)');
    } else if (result.statusCode === 403) {
      console.log('⚠️  Permission Denied (API not enabled or no access)');
    } else if (result.error?.includes('RESOURCE_EXHAUSTED')) {
      console.log('⚠️  Quota Exceeded');
    } else if (result.error?.includes('Internal error')) {
      console.log('❌ Internal Error (Same error code 13)');
    } else {
      console.log(`⚠️  ${result.error || 'Unknown error'}`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('Summary:');
  console.log('═'.repeat(70));
  
  const available = results.filter(r => r.success);
  const notFound = results.filter(r => r.statusCode === 404);
  const permissionDenied = results.filter(r => r.statusCode === 403);
  const internalError = results.filter(r => r.error?.includes('Internal error'));
  const otherErrors = results.filter(r => !r.success && r.statusCode !== 404 && r.statusCode !== 403 && !r.error?.includes('Internal error'));
  
  if (available.length > 0) {
    console.log(`\n✅ Available regions (${available.length}):`);
    available.forEach(r => {
      console.log(`   • ${r.region}`);
      if (r.region === 'us-central1') {
        console.log('     (Your current region)');
      }
    });
    
    if (!available.some(r => r.region === 'us-central1')) {
      console.log(`\n💡 Recommendation: Update your .env file:`);
      console.log(`   GCP_LOCATION=${available[0].region}`);
    }
  } else {
    console.log('\n❌ No regions available');
  }
  
  if (notFound.length > 0) {
    console.log(`\n❌ Model not found (${notFound.length}):`);
    notFound.forEach(r => console.log(`   • ${r.region}`));
  }
  
  if (permissionDenied.length > 0) {
    console.log(`\n⚠️  Permission denied (${permissionDenied.length}):`);
    permissionDenied.forEach(r => console.log(`   • ${r.region}`));
    console.log('\n   → Enable Vertex AI API for these regions');
    console.log('   → Check service account has Vertex AI User role');
  }
  
  if (internalError.length > 0) {
    console.log(`\n⚠️  Internal error code 13 (${internalError.length}):`);
    internalError.forEach(r => console.log(`   • ${r.region}`));
    console.log('\n   → Same error in multiple regions suggests a systemic issue');
    console.log('   → Check Google Cloud Status Dashboard');
  }
  
  if (available.length === 0 && internalError.length === REGIONS_TO_TEST.length) {
    console.log('\n🚨 CRITICAL: Error code 13 in ALL regions');
    console.log('   This strongly suggests:');
    console.log('   1. Service account missing required permissions');
    console.log('   2. Veo model not enabled in Model Garden');
    console.log('   3. Google Cloud service outage');
    console.log('\n   Next steps:');
    console.log('   → Visit Model Garden and ensure Veo 3 is enabled:');
    console.log('     https://console.cloud.google.com/vertex-ai/model-garden');
    console.log('   → Grant service account these roles:');
    console.log('     • roles/aiplatform.user');
    console.log('     • roles/storage.objectCreator');
  }
  
  console.log('\n' + '═'.repeat(70));
}

// Run tests
if (!GCP_PROJECT_ID || !GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('❌ Missing required environment variables');
  console.error('   Set GCP_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS in .env');
  process.exit(1);
}

testAllRegions().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
