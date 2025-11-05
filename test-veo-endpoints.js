/**
 * Test Veo using the Vertex AI Generative API approach
 * This uses a different endpoint structure that may be required for Veo
 */

const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

console.log('🎬 Testing Veo with Vertex AI Generative API approach\n');

async function testVeoGenerativeAPI() {
  try {
    const auth = new GoogleAuth({
      keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // Alternative endpoint structures to try
    const endpoints = [
      {
        name: 'Standard Predict (Current)',
        url: `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/veo-3.0-generate-preview:predictLongRunning`
      },
      {
        name: 'Generate Content',
        url: `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/veo-3.0-generate-preview:generateContent`
      },
      {
        name: 'Stream Generate Content',
        url: `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/veo-3.0-generate-preview:streamGenerateContent`
      },
      {
        name: 'Direct Model Predict',
        url: `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/models/veo-3.0-generate-preview:predict`
      }
    ];

    const testPayload = {
      instances: [
        {
          prompt: "A calm blue ocean"
        }
      ],
      parameters: {
        sampleCount: 1,
        resolution: '720p'
      }
    };

    console.log('Testing different endpoint structures:\n');
    console.log('═'.repeat(70));

    for (const endpoint of endpoints) {
      console.log(`\n📍 ${endpoint.name}`);
      console.log(`   ${endpoint.url.substring(0, 80)}...`);
      process.stdout.write('   Status: ');

      try {
        const response = await axios.post(endpoint.url, testPayload, {
          headers: {
            'Authorization': `Bearer ${token.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        console.log('✅ Accepted!');
        console.log(`   Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
        
        if (response.data.name) {
          console.log(`   Operation: ${response.data.name}`);
        }

      } catch (err) {
        if (err.response) {
          console.log(`❌ ${err.response.status} - ${err.response.statusText}`);
          if (err.response.data?.error) {
            console.log(`   Error: ${err.response.data.error.message}`);
          }
        } else {
          console.log(`❌ ${err.message}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n🔍 Checking Model Garden UI configuration...\n');
    
    console.log('Since the model shows "Open in Vertex AI Studio" and "View Code",');
    console.log('this suggests the model is available but may require:');
    console.log('  1. Using Vertex AI Studio UI (not programmatic API)');
    console.log('  2. Different authentication/authorization');
    console.log('  3. Project allowlisting for programmatic access');
    console.log('\n📋 Next Steps:');
    console.log('  1. Click "Open in Vertex AI Studio" in Model Garden');
    console.log('  2. Try creating a video in the Studio UI');
    console.log('  3. If it works in UI but not API → Request API access');
    console.log('  4. Check "View Code" to see Google\'s recommended code');
    console.log('\n🔗 Direct links:');
    console.log(`   Model Garden: https://console.cloud.google.com/vertex-ai/model-garden?project=${GCP_PROJECT_ID}`);
    console.log(`   Vertex AI Studio: https://console.cloud.google.com/vertex-ai/generative?project=${GCP_PROJECT_ID}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
  }
}

testVeoGenerativeAPI();
