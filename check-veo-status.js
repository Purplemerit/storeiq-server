/**
 * Check if Veo model is properly enabled and accessible
 */

const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

console.log('🔍 Checking Veo Model Status in Model Garden\n');

async function checkModelStatus() {
  try {
    const auth = new GoogleAuth({
      keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // Get model information
    const modelUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/veo-3.0-generate-preview`;

    console.log('Querying model details...');
    console.log(`URL: ${modelUrl}\n`);

    const response = await axios.get(modelUrl, {
      headers: {
        'Authorization': `Bearer ${token.token}`
      }
    });

    const model = response.data;
    console.log('✅ Model found!\n');
    console.log('Model Details:');
    console.log('─'.repeat(70));
    console.log(`Name: ${model.name || 'N/A'}`);
    console.log(`Display Name: ${model.displayName || 'N/A'}`);
    console.log(`Description: ${model.description || 'N/A'}`);
    console.log(`Version ID: ${model.versionId || 'N/A'}`);
    
    if (model.supportedActions) {
      console.log(`Supported Actions: ${model.supportedActions.join(', ')}`);
    }
    
    console.log('─'.repeat(70));
    console.log('\n✅ Model appears to be accessible');
    console.log('\n⚠️  However, you are still getting error code 13.');
    console.log('This suggests one of the following:');
    console.log('  1. Model is in preview and not fully operational yet');
    console.log('  2. Your project needs to be allowlisted for Veo access');
    console.log('  3. There is a temporary service issue with Veo');
    console.log('\n📋 Recommended Actions:');
    console.log('  1. Visit Model Garden and check for any "Enable" or "Request Access" buttons:');
    console.log(`     https://console.cloud.google.com/vertex-ai/model-garden?project=${GCP_PROJECT_ID}`);
    console.log('  2. Check if there are any Terms of Service to accept');
    console.log('  3. Look for a "Request Access" or "Join Waitlist" option');
    console.log('  4. Contact Google Cloud Support with your project ID');

  } catch (err) {
    if (err.response?.status === 404) {
      console.log('❌ Model Not Found\n');
      console.log('The model exists at the API level (you can start operations)');
      console.log('but is not properly registered in Model Garden.\n');
      console.log('This is the ROOT CAUSE of error code 13!\n');
      console.log('📋 Solution:');
      console.log('  1. Go to Model Garden:');
      console.log(`     https://console.cloud.google.com/vertex-ai/model-garden?project=${GCP_PROJECT_ID}`);
      console.log('  2. Search for "Veo" in the search bar');
      console.log('  3. Click on "Veo 3.0" model card');
      console.log('  4. Click "ENABLE" button');
      console.log('  5. Accept any Terms of Service');
      console.log('  6. Wait 5-10 minutes for propagation');
      console.log('  7. Run this script again to verify');
      
    } else if (err.response?.status === 403) {
      console.log('❌ Permission Denied\n');
      console.log('Your service account can access Vertex AI');
      console.log('but not the Veo model specifically.\n');
      console.log('📋 Solution:');
      console.log('  1. Enable Veo in Model Garden (see above)');
      console.log('  2. OR request access from your organization admin');
      
    } else {
      console.log('⚠️  Could not verify model status');
      console.log('Error:', err.response?.data || err.message);
    }
    
    console.log('\n' + '═'.repeat(70));
    console.log('NEXT STEPS:');
    console.log('═'.repeat(70));
    console.log('1. Visit Model Garden directly in your browser');
    console.log('2. Enable Veo 3.0 model');
    console.log('3. Wait 10 minutes');
    console.log('4. Run: node test-simple-prompts.js');
    console.log('═'.repeat(70));
  }
}

checkModelStatus();
