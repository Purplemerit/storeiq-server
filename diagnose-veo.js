#!/usr/bin/env node
/**
 * Veo-3 Diagnostic Script
 * Checks configuration and permissions before video generation
 */

require('dotenv').config();
const { checkGCSAccess, listModels } = require('./src/geminiService');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
const GCS_OUTPUT_BUCKET = process.env.GCS_OUTPUT_BUCKET;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log('='.repeat(70));
console.log('Veo-3 Configuration Diagnostic Tool');
console.log('='.repeat(70));

async function runDiagnostics() {
  let hasErrors = false;
  let hasWarnings = false;

  // 1. Check environment variables
  console.log('\n📋 Step 1: Checking Environment Variables');
  console.log('-'.repeat(70));
  
  const checks = [
    { name: 'GEMINI_API_KEY', value: GEMINI_API_KEY, required: true },
    { name: 'GCP_PROJECT_ID', value: GCP_PROJECT_ID, required: true },
    { name: 'GCP_LOCATION', value: GCP_LOCATION, required: true },
    { name: 'GCS_OUTPUT_BUCKET', value: GCS_OUTPUT_BUCKET, required: true },
    { name: 'GOOGLE_APPLICATION_CREDENTIALS', value: GOOGLE_APPLICATION_CREDENTIALS, required: true }
  ];

  for (const check of checks) {
    if (check.value) {
      console.log(`✓ ${check.name}: Set`);
      if (check.name === 'GCS_OUTPUT_BUCKET') {
        console.log(`  → gs://${check.value}`);
      }
    } else {
      if (check.required) {
        console.log(`✗ ${check.name}: NOT SET (required)`);
        hasErrors = true;
      } else {
        console.log(`⚠ ${check.name}: Not set (optional)`);
        hasWarnings = true;
      }
    }
  }

  if (hasErrors) {
    console.log('\n❌ Missing required environment variables. Please update your .env file.');
    return;
  }

  // 2. Check Gemini API Key
  console.log('\n🔑 Step 2: Validating Gemini API Key');
  console.log('-'.repeat(70));
  try {
    await listModels(GEMINI_API_KEY);
    console.log('✓ Gemini API Key is valid');
  } catch (err) {
    console.log('✗ Gemini API Key validation failed:', err.message);
    hasErrors = true;
  }

  // 3. Check Service Account
  console.log('\n👤 Step 3: Validating Service Account');
  console.log('-'.repeat(70));
  try {
    const auth = new GoogleAuth({
      keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    
    if (token.token) {
      console.log('✓ Service account authentication successful');
      
      // Get service account email
      const credentials = require(GOOGLE_APPLICATION_CREDENTIALS);
      console.log(`  → Service Account: ${credentials.client_email}`);
      console.log(`  → Project ID: ${credentials.project_id}`);
      
      if (credentials.project_id !== GCP_PROJECT_ID) {
        console.log(`⚠ Warning: Service account project (${credentials.project_id}) differs from GCP_PROJECT_ID (${GCP_PROJECT_ID})`);
        hasWarnings = true;
      }
    } else {
      console.log('✗ Failed to obtain access token');
      hasErrors = true;
    }
  } catch (err) {
    console.log('✗ Service account validation failed:', err.message);
    hasErrors = true;
  }

  // 4. Check GCS Bucket Access
  console.log('\n💾 Step 4: Checking GCS Bucket Access');
  console.log('-'.repeat(70));
  const bucketUri = `gs://${GCS_OUTPUT_BUCKET}/`;
  console.log(`Checking: ${bucketUri}`);
  
  const hasAccess = await checkGCSAccess(bucketUri);
  if (hasAccess) {
    console.log('✓ GCS bucket is accessible');
    console.log('✓ Service account has read permissions');
    
    // Test write permissions
    try {
      const auth = new GoogleAuth({
        keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      
      const testFile = `test-${Date.now()}.txt`;
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_OUTPUT_BUCKET}/o?uploadType=media&name=${testFile}`;
      
      await axios.post(uploadUrl, 'test', {
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'text/plain'
        }
      });
      
      console.log('✓ Service account has write permissions');
      
      // Clean up test file
      const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${GCS_OUTPUT_BUCKET}/o/${testFile}`;
      await axios.delete(deleteUrl, {
        headers: {
          'Authorization': `Bearer ${token.token}`
        }
      });
      console.log('✓ Test file created and deleted successfully');
      
    } catch (err) {
      if (err.response?.status === 403) {
        console.log('✗ Service account lacks write permissions');
        console.log('  → Grant "Storage Object Creator" role:');
        console.log(`  → gsutil iam ch serviceAccount:SERVICE_ACCOUNT_EMAIL:roles/storage.objectCreator gs://${GCS_OUTPUT_BUCKET}`);
        hasErrors = true;
      } else {
        console.log('⚠ Could not verify write permissions:', err.message);
        hasWarnings = true;
      }
    }
  } else {
    console.log('✗ GCS bucket is not accessible');
    console.log('  → Check that the bucket exists:');
    console.log(`  → gsutil ls gs://${GCS_OUTPUT_BUCKET}`);
    console.log('  → Grant permissions to service account:');
    console.log(`  → gsutil iam ch serviceAccount:SERVICE_ACCOUNT_EMAIL:roles/storage.objectCreator gs://${GCS_OUTPUT_BUCKET}`);
    hasErrors = true;
  }

  // 5. Check Vertex AI API
  console.log('\n🤖 Step 5: Checking Vertex AI API Access');
  console.log('-'.repeat(70));
  try {
    const auth = new GoogleAuth({
      keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    
    // Try to list models in Model Garden
    const listUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models`;
    
    const response = await axios.get(listUrl, {
      headers: {
        'Authorization': `Bearer ${token.token}`
      }
    });
    
    console.log('✓ Vertex AI API is accessible');
    
    // Check if Veo models are available
    const models = response.data.publisherModels || [];
    const veoModels = models.filter(m => m.name && m.name.includes('veo'));
    
    if (veoModels.length > 0) {
      console.log(`✓ Found ${veoModels.length} Veo model(s) in region ${GCP_LOCATION}:`);
      veoModels.forEach(m => {
        const modelName = m.name.split('/').pop();
        console.log(`  → ${modelName}`);
      });
    } else {
      console.log(`⚠ No Veo models found in region ${GCP_LOCATION}`);
      console.log('  → Try a different region (us-east4, europe-west4)');
      console.log('  → Or enable Veo in Model Garden:');
      console.log('  → https://console.cloud.google.com/vertex-ai/model-garden');
      hasWarnings = true;
    }
    
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✗ Vertex AI API access denied');
      console.log('  → Enable Vertex AI API:');
      console.log('  → https://console.cloud.google.com/apis/library/aiplatform.googleapis.com');
      console.log('  → Grant "Vertex AI User" role to service account:');
      console.log(`  → gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" --role="roles/aiplatform.user"`);
      hasErrors = true;
    } else {
      console.log('⚠ Could not verify Vertex AI API access:', err.response?.status, err.message);
      hasWarnings = true;
    }
  }

  // 6. Summary
  console.log('\n' + '='.repeat(70));
  console.log('Diagnostic Summary');
  console.log('='.repeat(70));
  
  if (hasErrors) {
    console.log('❌ FAILED: Critical issues found. Fix the errors above before using Veo.');
  } else if (hasWarnings) {
    console.log('⚠️  WARNINGS: Some issues detected. Veo may work but could fail.');
  } else {
    console.log('✅ SUCCESS: All checks passed! Your configuration looks good.');
    console.log('\nYou can now try generating a video:');
    console.log('  node test-veo.js');
  }
  
  console.log('\nFor more help, see:');
  console.log('  - VEO_SETUP_GUIDE.md');
  console.log('  - VEO_REGIONAL_AVAILABILITY.md');
  console.log('  - https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo');
  console.log('='.repeat(70));
}

// Run diagnostics
runDiagnostics().catch(err => {
  console.error('\n❌ Diagnostic script failed:', err.message);
  process.exit(1);
});
