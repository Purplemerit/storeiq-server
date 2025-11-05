require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// Gemini and Veo-3 API integration service
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in environment');

// Vertex AI Configuration for Veo
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// Veo Model Configuration
// Supported models: 'standard' (high quality, slower) or 'fast' (lower quality, faster)
const VEO_MODEL_TYPE = process.env.VEO_MODEL_TYPE || 'standard';

// Available Veo model variants
// Note: Not all models are available in all regions
const VEO_MODELS = {
  standard: 'veo-3.0-generate-001',            // GA version (General Availability) - CORRECT MODEL NAME
  ga: 'veo-3.0-generate-001',                  // Alias for standard (GA version)
  preview: 'veo-3.0-generate-preview',         // Preview version (may not work)
  // The following models may not be available in all regions:
  fast: 'veo-3.0-fast-preview',                // Fast generation (limited availability)
  v2: 'veo-2.0-generate',                      // Older version (limited availability)
  v3: 'veo-3.0-generate',                      // Alternative naming (limited availability)
  // Add more models as they become available
};

// Select the model based on configuration
const VEO_MODEL = VEO_MODELS[VEO_MODEL_TYPE] || VEO_MODELS.standard;

// Gemini configuration (uses API key)
const GEMINI_MODEL = 'models/gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent`;
const GEMINI_LIST_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Vertex AI Veo configuration (uses OAuth 2.0)
// Note: Veo requires Vertex AI, not the generativelanguage API
let VEO3_API_URL = null;
if (GCP_PROJECT_ID && GCP_LOCATION) {
  VEO3_API_URL = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:predictLongRunning`;
}

// Initialize Google Auth for Vertex AI
let googleAuth = null;
if (GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    googleAuth = new GoogleAuth({
      keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
  } catch (err) {
    console.warn('Google Auth initialization failed:', err.message);
  }
}

/**
 * Get access token for Vertex AI using OAuth 2.0
 */
async function getAccessToken() {
  if (!googleAuth) {
    throw new Error('Google Auth not initialized. Set GOOGLE_APPLICATION_CREDENTIALS in .env');
  }
  try {
    const client = await googleAuth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) {
      throw new Error('Failed to obtain access token');
    }
    return token.token;
  } catch (err) {
    throw new Error('Failed to get access token: ' + err.message);
  }
}

/**
 * List available Gemini models for the API key.
 * Logs the available models and returns the list.
 */
async function listModels(apiKey = GEMINI_API_KEY) {
  try {
    const response = await axios.get(
      `${GEMINI_LIST_MODELS_URL}?key=${apiKey}`
    );
    const models = response.data.models || [];
    console.log('Available Gemini models:', models.map(m => m.name).join(', '));
    return models;
  } catch (err) {
    console.error('Error fetching models:', err.response?.data?.error?.message || err.message);
    throw new Error('Failed to list models');
  }
}

async function generateScript(prompt) {
  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      }
    );
    // Gemini returns candidates[0].content.parts[0].text
    const script = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!script) throw new Error('No script returned from Gemini');
    return script;
  } catch (err) {
    let apiMsg = err.response?.data?.error?.message || err.message;
    if (err.response?.status === 404) {
      apiMsg += ` (Model "${GEMINI_MODEL}" may not be supported for your API key)`;
    }
    throw new Error('Gemini API error: ' + apiMsg);
  }
}

/**
 * Improve prompt for better Veo results
 * Converts abstract/meta instructions into concrete visual descriptions
 * @param {string} prompt - Original prompt
 * @returns {string} - Improved prompt
 */
function improvePromptForVeo(prompt) {
  let improved = prompt;
  
  // Remove meta-instructions more carefully
  improved = improved.replace(/^(create|make|generate|produce)\s+(a\s+)?video\s+(about|of|showing|depicting|displaying)\s+/i, '');
  improved = improved.replace(/^(show|display)\s+me\s+(a\s+)?(video\s+)?(about|of)?\s*/i, '');
  improved = improved.replace(/^(create|make|generate|produce|show|display)\s+/i, '');
  
  // Clean up any leftover punctuation
  improved = improved.replace(/^[,.\s]+/, '').trim();
  
  // For abstract concepts, try to make them more concrete and visual
  // Example: "sustainable living tips" -> "person using reusable bags, solar panels on rooftop, recycling bins"
  const abstractConcepts = {
    'sustainable living tips': 'person gardening in community garden, reusable shopping bags, solar panels on house roof',
    'sustainable living': 'eco-friendly home with solar panels, person riding bicycle, recycling bins',
    'healthy lifestyle': 'person jogging in park at sunrise, fresh vegetables on kitchen counter, yoga session',
    'productivity tips': 'organized desk with laptop, person writing in planner, clean workspace',
    'cooking tips': 'chef chopping vegetables in bright kitchen, pots on stove, fresh ingredients',
  };
  
  // Check if the improved prompt matches any abstract concepts
  const lowerImproved = improved.toLowerCase();
  for (const [concept, visualization] of Object.entries(abstractConcepts)) {
    if (lowerImproved.includes(concept)) {
      improved = improved.toLowerCase().replace(concept, visualization);
      console.log(`💡 Converted abstract concept "${concept}" to visual description`);
      break;
    }
  }
  
  // Ensure it starts with a proper article or description
  if (!/^(a|an|the|person|people|scene|landscape|cityscape)/i.test(improved)) {
    // Check if it starts with a plural or uncountable noun
    const startsWithPlural = /^(people|children|trees|buildings|cars|clouds|mountains|waves)/i.test(improved);
    const startsWithUncountable = /^(water|fire|smoke|fog|rain|snow|light)/i.test(improved);
    
    if (!startsWithPlural && !startsWithUncountable) {
      const startsWithVowel = /^[aeiou]/i.test(improved);
      improved = (startsWithVowel ? 'An ' : 'A ') + improved;
    }
  }
  
  // Add cinematic qualities only if prompt is very short
  const wordCount = improved.split(/\s+/).length;
  if (wordCount < 6) {
    improved += ', soft natural lighting';
  }
  
  // Capitalize first letter
  improved = improved.charAt(0).toUpperCase() + improved.slice(1);
  
  return improved.trim();
}

/**
 * Check if service account has access to GCS bucket
 * @param {string} bucketUri - GCS bucket URI (gs://bucket-name/path/)
 * @returns {Promise<boolean>} - True if accessible
 */
async function checkGCSAccess(bucketUri) {
  if (!bucketUri || !googleAuth) {
    return false;
  }
  
  try {
    // Parse bucket name from URI
    const match = bucketUri.match(/^gs:\/\/([^/]+)/);
    if (!match) return false;
    
    const bucketName = match[1];
    const accessToken = await getAccessToken();
    
    // Try to list bucket to verify access
    const testUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o?maxResults=1`;
    await axios.get(testUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    return true;
  } catch (err) {
    console.error('⚠ GCS bucket access check failed:', err.response?.status, err.response?.statusText);
    if (err.response?.status === 403) {
      console.error('   → Service account lacks permissions to bucket');
      console.error('   → Grant "Storage Object Creator" role to your service account');
    } else if (err.response?.status === 404) {
      console.error('   → Bucket not found or not accessible');
    }
    return false;
  }
}

/**
 * Sanitize and validate video generation prompt
 * @param {string|object} prompt - Raw prompt input
 * @returns {string} - Sanitized prompt string
 */
function sanitizePrompt(prompt) {
  let text = typeof prompt === 'string' ? prompt : prompt.text || prompt.prompt || '';
  
  // Remove potentially problematic content
  text = text.trim();
  
  // Ensure prompt is not too short or too long
  if (text.length < 10) {
    throw new Error('Prompt too short. Minimum 10 characters required.');
  }
  if (text.length > 500) {
    console.warn('⚠ Prompt is very long. Truncating to 500 characters for better results.');
    text = text.substring(0, 500);
  }
  
  // Check for abstract/problematic patterns
  const abstractPatterns = [
    /create a video about/i,
    /make a video/i,
    /video about/i,
    /show me/i,
    /generate/i
  ];
  
  let hasAbstractPattern = false;
  for (const pattern of abstractPatterns) {
    if (pattern.test(text)) {
      hasAbstractPattern = true;
      break;
    }
  }
  
  if (hasAbstractPattern) {
    console.warn('⚠ Warning: Prompt contains meta-instructions (e.g., "create a video about...")');
    console.warn('   Veo works best with direct visual descriptions.');
    console.warn('   Example: Instead of "Create a video about a sunset"');
    console.warn('            Use: "A golden sunset over calm ocean waters, seagulls flying"');
    console.warn('   Continuing with original prompt, but this may cause error code 13...');
  }
  
  return text;
}

async function generateVideo(prompt, videoConfig = {}) {
  // Allow model type override via videoConfig
  const modelType = videoConfig.modelType || VEO_MODEL_TYPE;
  const selectedModel = VEO_MODELS[modelType] || VEO_MODELS.standard;
  
  // Build the API URL with the selected model
  const apiUrl = GCP_PROJECT_ID && GCP_LOCATION 
    ? `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${selectedModel}:predictLongRunning`
    : null;

  // Validate Vertex AI configuration
  if (!GCP_PROJECT_ID || !apiUrl) {
    console.warn('Veo-3 video generation requires GCP_PROJECT_ID and GCP_LOCATION in .env');
    return {
      mock: true,
      message: 'Veo-3 video generation requires Google Cloud Project configuration. Set GCP_PROJECT_ID, GCP_LOCATION, and GOOGLE_APPLICATION_CREDENTIALS in your .env file.',
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' // Mock video for demo
    };
  }

  if (!googleAuth) {
    console.warn('Veo-3 requires service account authentication. Set GOOGLE_APPLICATION_CREDENTIALS in .env');
    return {
      mock: true,
      message: 'Veo-3 requires service account authentication. Set GOOGLE_APPLICATION_CREDENTIALS in your .env file.',
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4'
    };
  }

  try {
    // Sanitize and validate prompt
    let sanitizedPrompt = sanitizePrompt(prompt);
    
    // Auto-improve prompt if requested
    if (videoConfig.autoImprovePrompt !== false) {  // Default is true
      const improvedPrompt = improvePromptForVeo(sanitizedPrompt);
      if (improvedPrompt !== sanitizedPrompt) {
        console.log('📝 Original prompt:', sanitizedPrompt);
        console.log('📝 Improved prompt:', improvedPrompt);
        sanitizedPrompt = improvedPrompt;
      }
    }
    
    console.log('Using prompt:', sanitizedPrompt.substring(0, 100) + (sanitizedPrompt.length > 100 ? '...' : ''));
    
    // Generate a unique output path in GCS if not provided
    const timestamp = Date.now();
    const outputStorageUri = videoConfig.storageUri || 
      (process.env.GCS_OUTPUT_BUCKET ? `gs://${process.env.GCS_OUTPUT_BUCKET}/veo-outputs/${timestamp}/` : null);
    
    // Check GCS bucket access if storage URI is provided
    if (outputStorageUri) {
      const hasAccess = await checkGCSAccess(outputStorageUri);
      if (!hasAccess) {
        console.warn('⚠ Warning: GCS bucket may not be accessible. This could cause error code 13.');
        console.warn('   Continuing anyway, but if you get error 13, check bucket permissions.');
      } else {
        console.log('✓ GCS bucket access verified');
      }
    }
    
    // Get OAuth 2.0 access token
    const accessToken = await getAccessToken();

    // Prepare Vertex AI request payload
    // Reference: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation
    
    const payload = {
      instances: [
        {
          prompt: sanitizedPrompt
        }
      ],
      parameters: {
        // Number of video files to generate (1-2)
        sampleCount: videoConfig.sampleCount || 1,
        
        // Resolution: '720p' or '1080p' (360p is NOT supported by Veo-3)
        resolution: videoConfig.resolution || '720p'
      }
    };
    
    // Add storage URI only if provided
    if (outputStorageUri) {
      payload.parameters.storageUri = outputStorageUri;
    }
    
    // Add storage URI if available (required for outputs)
    if (outputStorageUri) {
      payload.parameters.storageUri = outputStorageUri;
    };
    
    // Add storage URI only if provided
    if (outputStorageUri) {
      payload.parameters.storageUri = outputStorageUri;
    }
    
    // Add optional parameters only if explicitly provided
    if (videoConfig.generateAudio === true || videoConfig.generateAudio === false) {
      payload.parameters.generateAudio = videoConfig.generateAudio;
    }

    console.log('Veo-3 API Request:', {
      url: apiUrl,
      model: selectedModel,
      modelType: modelType,
      method: 'POST',
      authType: 'OAuth 2.0 Bearer Token',
      payload: JSON.stringify(payload, null, 2)
    });

    // Make authenticated request to Vertex AI
    const response = await axios.post(
      apiUrl,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Veo-3 API Response Status:', response.status);
    console.log('Veo-3 API Response Data:', JSON.stringify(response.data, null, 2));

    // Veo returns a long-running operation
    // Response format: { name: 'projects/.../operations/...' }
    const operationName = response.data?.name;
    
    if (!operationName) {
      console.error('Veo-3 API response:', JSON.stringify(response.data, null, 2));
      throw new Error('No operation name returned from Veo-3');
    }

    console.log('✓ Operation started:', operationName);

    // Return operation info - caller should poll for completion
    return {
      operationName,
      status: 'PROCESSING',
      message: 'Video generation started. Poll the operation endpoint to check status.',
      // Use the full operation name as returned by the API
      statusUrl: `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/${operationName}`
    };

  } catch (err) {
    // Detailed error logging
    if (err.response) {
      console.error('Veo-3 API Error Response:', {
        status: err.response.status,
        statusText: err.response.statusText,
        data: JSON.stringify(err.response.data, null, 2),
        headers: JSON.stringify(err.response.headers, null, 2)
      });
    } else {
      console.error('Veo-3 API error (no response):', err.message);
    }

    // Handle specific error cases
    if (err.response?.status === 403) {
      return {
        mock: true,
        message: 'Veo-3 access denied. Ensure your service account has Vertex AI permissions (roles/aiplatform.user).',
        videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4'
      };
    }

    if (err.response?.status === 404) {
      return {
        mock: true,
        message: `Veo model "${selectedModel}" not available in region "${GCP_LOCATION}". The model may not be enabled or not supported in this region. Try using "standard" model or check Model Garden for available models.`,
        videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
        suggestion: 'Use VEO_MODEL_TYPE=standard in .env or enable the model in Model Garden'
      };
    }

    throw new Error(JSON.stringify({
      error: 'Veo-3 API error',
      message: err.response?.data?.error?.message || err.message,
      status: err.response?.status || 500,
      details: err.response?.data || null
    }));
  }
}

/**
 * Poll Veo-3 operation status
 * @param {string} operationName - Full operation name from generateVideo response
 * @returns {Promise<object>} - Operation status and video data when complete
 */
async function getVideoOperationStatus(operationName) {
  if (!googleAuth) {
    throw new Error('Google Auth not initialized');
  }

  try {
    const accessToken = await getAccessToken();
    
    // Veo-3 uses a special fetchPredictOperation endpoint to check status
    // We need to POST to the model's fetchPredictOperation endpoint with the operation name
    const fetchUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/veo-3.0-generate-preview:fetchPredictOperation`;

    console.log('Polling operation via fetchPredictOperation');

    const response = await axios.post(fetchUrl, {
      operationName: operationName
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const operation = response.data;
    console.log('Operation status:', operation.done ? 'COMPLETED' : 'PROCESSING');

    // Check if operation is complete
    if (operation.done) {
      // Success case - check for response with videos array (official format from documentation)
      if (operation.response && operation.response.videos) {
        const videos = operation.response.videos.map((video, index) => {
          console.log(`Processing video ${index + 1}:`, Object.keys(video));
          return {
            url: video.gcsUri,
            mimeType: video.mimeType || 'video/mp4',
            type: 'gcs'
          };
        });

        return {
          status: 'COMPLETED',
          videos,
          operation
        };
      }
      
      // Legacy format: check for predictions (older API format)
      if (operation.response && operation.response.predictions) {
        const predictions = operation.response.predictions || [];
        
        // Extract video data from predictions
        const videos = predictions.map((prediction, index) => {
          console.log(`Processing prediction ${index + 1}:`, Object.keys(prediction));
          
          // Check if video is in Cloud Storage (gcsUri)
          if (prediction.gcsUri) {
            return {
              url: prediction.gcsUri,
              mimeType: prediction.mimeType || 'video/mp4',
              type: 'gcs'
            };
          }
          // Check if video is base64 encoded in response
          if (prediction.bytesBase64Encoded) {
            return {
              videoData: prediction.bytesBase64Encoded,
              mimeType: prediction.mimeType || 'video/mp4',
              type: 'base64'
            };
          }
          // Check alternative response formats
          if (prediction.videoUri) {
            return {
              url: prediction.videoUri,
              mimeType: prediction.mimeType || 'video/mp4',
              type: 'uri'
            };
          }
          return null;
        }).filter(v => v !== null);

        if (videos.length === 0) {
          console.error('No video data found in predictions:', JSON.stringify(predictions, null, 2));
          throw new Error('No video data in completed operation response');
        }

        return {
          status: 'COMPLETED',
          videos,
          operation
        };
      }
      
      // Error case
      if (operation.error) {
        console.error('Operation failed with error:', JSON.stringify(operation.error, null, 2));
        
        // Provide helpful error messages based on error code
        let errorMessage = operation.error.message || JSON.stringify(operation.error);
        let suggestion = '';
        
        if (operation.error.code === 13) {
          suggestion = 'Internal error from Veo API. This could be due to:\n' +
            '  1. Content policy violation - Try simplifying or modifying your prompt\n' +
            '  2. Model availability issues in the region - Try a different region (e.g., us-east4, europe-west4)\n' +
            '  3. GCS bucket permissions - Ensure the service account has write access to the output bucket\n' +
            '  4. Temporary service issue - Retry the request after a few minutes';
        } else if (operation.error.code === 7) {
          suggestion = 'Permission denied. Ensure your service account has:\n' +
            '  - roles/aiplatform.user\n' +
            '  - roles/storage.objectCreator (for GCS bucket)\n' +
            '  - Vertex AI API enabled';
        } else if (operation.error.code === 3) {
          suggestion = 'Invalid argument. Check your prompt and video configuration parameters.';
        }
        
        return {
          status: 'FAILED',
          error: errorMessage,
          errorCode: operation.error.code,
          errorDetails: operation.error,
          suggestion,
          operation
        };
      }
      
      // Done but no response or error
      console.error('Operation done but no response or error:', JSON.stringify(operation, null, 2));
      throw new Error('Operation completed but no video or error in response');
    }

    // Still processing
    const metadata = operation.metadata || {};
    return {
      status: 'PROCESSING',
      progress: metadata.progressPercent || 0,
      metadata,
      operation
    };

  } catch (err) {
    if (err.response?.status === 404) {
      console.error('❌ Operation not found (404). Possible reasons:');
      console.error('   1. Operation was created in a different region');
      console.error('   2. Operation ID is malformed');
      console.error('   3. Operation has expired');
      console.error('   Operation name:', operationName);
      console.error('   Expected URL:', `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/${operationName}`);
    }
    console.error('Error polling Veo-3 operation:', err.response?.data || err.message);
    throw new Error('Failed to get operation status: ' + (err.response?.data?.error?.message || err.message));
  }
}

/**
 * Generate video and wait for completion (with polling and retry on internal errors)
 * @param {string} prompt - Video generation prompt
 * @param {object} videoConfig - Video configuration options
 * @param {object} options - Polling options { maxAttempts, pollInterval, retryOnInternalError }
 * @returns {Promise<object>} - Completed video data
 */
async function generateVideoAndWait(prompt, videoConfig = {}, options = {}) {
  const maxAttempts = options.maxAttempts || 60; // 5 minutes with 5s interval
  const pollInterval = options.pollInterval || 5000; // 5 seconds
  const maxRetries = options.maxRetries || 2; // Retry on internal errors
  const retryDelay = options.retryDelay || 10000; // 10 seconds between retries
  
  let lastError = null;
  
  // Retry strategies: try different configurations on each retry
  const retryStrategies = [
    { name: 'Original', config: {} },
    { name: '720p Resolution', config: { resolution: '720p' } },
    { name: 'No Storage URI + 720p', config: { storageUri: undefined, resolution: '720p' } }
  ];
  
  // Retry loop for internal errors
  for (let retry = 0; retry <= maxRetries; retry++) {
    if (retry > 0) {
      const strategy = retryStrategies[Math.min(retry, retryStrategies.length - 1)];
      console.log(`\n⟳ Retry attempt ${retry}/${maxRetries} with strategy: ${strategy.name}`);
      console.log(`   Config:`, JSON.stringify(strategy.config));
      console.log(`   Waiting ${retryDelay/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Apply retry strategy
      videoConfig = { ...videoConfig, ...strategy.config };
    }
    
    try {
      // Start video generation
      const result = await generateVideo(prompt, videoConfig);
      
      // Handle mock mode
      if (result.mock) {
        return result;
      }
      
      console.log('Video generation started. Operation:', result.operationName);
      console.log('Polling for completion...');
      
      // Poll for completion
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const status = await getVideoOperationStatus(result.operationName);
        
        const progressStr = status.progress ? ` (${status.progress}%)` : '';
        process.stdout.write(`\rAttempt ${attempt}/${maxAttempts} - Status: ${status.status}${progressStr}     `);
        
        if (status.status === 'COMPLETED') {
          console.log('\n✓ Video generation completed!');
          if (retry > 0) {
            console.log(`✓ Success after ${retry} retries using strategy: ${retryStrategies[Math.min(retry, retryStrategies.length - 1)].name}`);
          }
          return {
            ...result,
            ...status,
            status: 'COMPLETED',
            retriesUsed: retry,
            successStrategy: retry > 0 ? retryStrategies[Math.min(retry, retryStrategies.length - 1)].name : 'Original'
          };
        }
        
        if (status.status === 'FAILED') {
          console.log('\n✗ Video generation failed');
          
          // Check if error is retryable (code 13 = internal error)
          if (status.errorCode === 13 && retry < maxRetries) {
            console.log(`⚠ Internal error detected (code 13). Will retry with different configuration...`);
            if (status.suggestion) {
              console.log('\nSuggestion:', status.suggestion);
            }
            lastError = status;
            break; // Break inner loop to retry
          }
          
          // Non-retryable error or max retries reached
          if (retry >= maxRetries && status.errorCode === 13) {
            // Provide detailed troubleshooting for persistent error 13
            const troubleshootingMsg = `
Video generation failed after ${maxRetries + 1} attempts with persistent error code 13.

This error typically indicates one of the following issues:

1. **Content Policy Issue**: Your prompt may be triggering safety filters
   → Try: "${sanitizePrompt(prompt).substring(0, 50)}..." seems safe, but try even simpler prompts
   → Example: "A calm ocean scene" or "Green forest landscape"

2. **GCS Bucket Access Issue**: Service account may lack permissions
   → Bucket: ${videoConfig.storageUri || process.env.GCS_OUTPUT_BUCKET}
   → Check: Service account has 'storage.objectCreator' role
   → Verify: gsutil ls ${videoConfig.storageUri || 'gs://' + process.env.GCS_OUTPUT_BUCKET}

3. **Regional Availability**: Model may not be fully operational in ${GCP_LOCATION}
   → Try regions: us-east4, europe-west4, asia-southeast1
   → Update: Set GCP_LOCATION in your .env file

4. **Model Access Issue**: Veo model may not be enabled for your project
   → Check: https://console.cloud.google.com/vertex-ai/model-garden
   → Enable: Search for "Veo 3" and enable it

5. **Quota Issue**: You may have hit quota limits
   → Check: https://console.cloud.google.com/iam-admin/quotas?q=vertex

Tried configurations:
${retryStrategies.slice(0, retry + 1).map((s, i) => `  ${i + 1}. ${s.name}: ${JSON.stringify(s.config)}`).join('\n')}

Recommendation: Check GCS bucket permissions first, as this is the most common cause.
`;
            throw new Error(troubleshootingMsg);
          }
          
          // Non-retryable error or max retries reached
          const errorMsg = status.suggestion 
            ? `${status.error}\n\nSuggestion: ${status.suggestion}`
            : status.error;
          throw new Error(`Video generation failed: ${errorMsg}`);
        }
      }
      
      // If we got here, it's a timeout (not an error that broke the loop)
      if (!lastError) {
        throw new Error(`Video generation timeout after ${maxAttempts} attempts. Operation may still be processing. Check status at: ${result.statusUrl}`);
      }
      
    } catch (err) {
      // If it's not a retryable error or we're out of retries, throw
      if (!err.message.includes('Internal error') || retry >= maxRetries) {
        throw err;
      }
      lastError = err;
    }
  }
  
  // All retries exhausted
  throw new Error(`Video generation failed after ${maxRetries + 1} attempts. Last error: ${lastError?.error || lastError?.message || 'Unknown error'}`);
}

/**
 * Download video from Cloud Storage URL
 * @param {string} gcsUri - Cloud Storage URI (gs://bucket/path)
 * @returns {Promise<Buffer>} - Video data as buffer
 */
async function downloadVideoFromGCS(gcsUri) {
  if (!googleAuth) {
    throw new Error('Google Auth not initialized');
  }

  try {
    // Parse GCS URI: gs://bucket-name/path/to/file
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid GCS URI format: ${gcsUri}`);
    }
    
    const [, bucket, objectPath] = match;
    const accessToken = await getAccessToken();
    
    // Use Cloud Storage JSON API to download
    const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
    
    const response = await axios.get(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data);
  } catch (err) {
    console.error('Error downloading from GCS:', err.message);
    throw new Error(`Failed to download video from Cloud Storage: ${err.message}`);
  }
}

module.exports = { 
  generateScript, 
  generateVideo, 
  getVideoOperationStatus,
  generateVideoAndWait,
  downloadVideoFromGCS,
  sanitizePrompt,
  improvePromptForVeo,
  checkGCSAccess,
  listModels 
};

// TEMP: Log available Gemini models at startup for debugging
if (require.main === module) {
  console.log('\n=== Gemini Service Configuration ===');
  console.log('GEMINI_API_KEY:', GEMINI_API_KEY ? '✓ Set' : '✗ Not set');
  console.log('GCP_PROJECT_ID:', GCP_PROJECT_ID || '✗ Not set (required for Veo)');
  console.log('GCP_LOCATION:', GCP_LOCATION);
  console.log('VEO_MODEL_TYPE:', VEO_MODEL_TYPE, `(${VEO_MODEL})`);
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', GOOGLE_APPLICATION_CREDENTIALS ? '✓ Set' : '✗ Not set (required for Veo)');
  console.log('Veo API URL:', VEO3_API_URL || '✗ Not configured');
  console.log('Google Auth:', googleAuth ? '✓ Initialized' : '✗ Not initialized');
  console.log('====================================\n');

  // List available Gemini models
  listModels(GEMINI_API_KEY)
    .then(models => {
      console.log('✓ Gemini API Key is valid');
    })
    .catch(err => {
      console.error('✗ Gemini API Key error:', err.message);
    });
}