/**
 * List all available Veo models in your project
 */

const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

console.log('🔍 Searching for all available Veo models\n');

async function listVeoModels() {
  try {
    const auth = new GoogleAuth({
      keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // List all publisher models
    const listUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models`;

    console.log('Fetching all available models...\n');

    const response = await axios.get(listUrl, {
      headers: {
        'Authorization': `Bearer ${token.token}`
      }
    });

    const models = response.data.publisherModels || [];
    
    // Filter for Veo models
    const veoModels = models.filter(m => 
      m.name && (
        m.name.toLowerCase().includes('veo') ||
        m.displayName?.toLowerCase().includes('veo')
      )
    );

    if (veoModels.length === 0) {
      console.log('❌ No Veo models found in the publisher models list');
      console.log('\nHowever, since the model is "enabled" in Model Garden,');
      console.log('it should be accessible via the direct endpoint.\n');
      console.log('Let\'s try with different model names...\n');
      
      // Try different model name variants
      const modelVariants = [
        'veo-3.0-generate-preview',
        'veo-3.0-generate',
        'veo-2.0-generate',
        'veo-3-generate-preview',
        'veo3-generate-preview',
        'imagen-veo-3.0',
        'video-generation-001'
      ];
      
      console.log('Testing model name variants:');
      console.log('─'.repeat(70));
      
      for (const modelName of modelVariants) {
        process.stdout.write(`Testing: ${modelName.padEnd(30)} ... `);
        
        try {
          const testUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${modelName}`;
          
          const modelResponse = await axios.get(testUrl, {
            headers: {
              'Authorization': `Bearer ${token.token}`
            },
            timeout: 5000
          });
          
          console.log('✅ FOUND!');
          console.log(`   Display Name: ${modelResponse.data.displayName || 'N/A'}`);
          console.log(`   Version: ${modelResponse.data.versionId || 'N/A'}`);
          
        } catch (err) {
          if (err.response?.status === 404) {
            console.log('❌ Not found');
          } else if (err.response?.status === 403) {
            console.log('⚠️  Permission denied');
          } else {
            console.log(`⚠️  Error: ${err.message}`);
          }
        }
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } else {
      console.log(`✅ Found ${veoModels.length} Veo model(s):\n`);
      console.log('─'.repeat(70));
      
      veoModels.forEach((model, index) => {
        console.log(`\n${index + 1}. Model Name: ${model.name}`);
        console.log(`   Display Name: ${model.displayName || 'N/A'}`);
        console.log(`   Description: ${model.description || 'N/A'}`);
        console.log(`   Version: ${model.versionId || 'N/A'}`);
        
        // Extract model ID from name
        const modelId = model.name.split('/').pop();
        console.log(`   Model ID to use: "${modelId}"`);
        
        if (model.supportedActions) {
          console.log(`   Supported Actions: ${model.supportedActions.join(', ')}`);
        }
      });
      
      console.log('\n' + '─'.repeat(70));
      console.log('\n💡 Update your .env file with the correct model name');
      console.log('   Or modify geminiService.js to use the correct model ID');
    }
    
    console.log('\n' + '═'.repeat(70));
    console.log('Additional Check: Testing Direct Video Generation');
    console.log('═'.repeat(70));
    
    // Try a minimal video generation request
    console.log('\nAttempting minimal video generation request...');
    const generateUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/veo-3.0-generate-preview:predictLongRunning`;
    
    try {
      const genResponse = await axios.post(generateUrl, {
        instances: [{ prompt: "test" }],
        parameters: { sampleCount: 1, resolution: '720p' }
      }, {
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ Request accepted! (Status 200)');
      console.log('Operation ID:', genResponse.data.name?.split('/').pop() || 'N/A');
      console.log('\n⚠️  Model accepts requests but fails during processing.');
      console.log('This confirms the error is happening AFTER the request is accepted.');
      
    } catch (err) {
      if (err.response?.status === 400) {
        console.log('⚠️  Bad Request (400):', err.response.data?.error?.message);
        console.log('This might indicate parameter issues.');
      } else if (err.response?.status === 404) {
        console.log('❌ Endpoint not found (404)');
        console.log('The model endpoint does not exist or uses a different path.');
      } else if (err.response?.status === 403) {
        console.log('❌ Permission denied (403)');
        console.log('Your service account may lack permissions for video generation.');
      } else {
        console.log('Error:', err.response?.data || err.message);
      }
    }
    
    console.log('\n' + '═'.repeat(70));
    console.log('RECOMMENDATION:');
    console.log('═'.repeat(70));
    console.log('Since the model is "enabled" but still returning error code 13:');
    console.log('1. The model may be in LIMITED PREVIEW and not fully operational');
    console.log('2. Your project may need ALLOWLISTING by Google');
    console.log('3. Try opening Vertex AI Studio and test video generation there');
    console.log('4. If it works in Studio but not via API, contact Google Support');
    console.log('\n📋 Open Vertex AI Studio:');
    console.log(`   https://console.cloud.google.com/vertex-ai/generative/video/create?project=${GCP_PROJECT_ID}`);
    console.log('\n   If video generation works there, request API access from Google.');
    console.log('═'.repeat(70));

  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
}

listVeoModels();
