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
  fast: 'veo-3.0-fast-generate-001',                // Fast generation (limited availability)
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
    console.error('GCS bucket access check failed:', err.response?.status, err.response?.statusText);
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
    console.warn('⚠ Warning: Prompt contains meta-instructions. Use direct visual descriptions instead.');
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
        sanitizedPrompt = improvedPrompt;
      }
    }
    
    // Generate a unique output path in GCS if not provided
    const timestamp = Date.now();
    const outputStorageUri = videoConfig.storageUri || 
      (process.env.GCS_OUTPUT_BUCKET ? `gs://${process.env.GCS_OUTPUT_BUCKET}/veo-outputs/${timestamp}/` : null);
    
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

    // Veo returns a long-running operation
    // Response format: { name: 'projects/.../operations/...' }
    const operationName = response.data?.name;
    
    if (!operationName) {
      console.error('Veo-3 API response:', JSON.stringify(response.data, null, 2));
      throw new Error('No operation name returned from Veo-3');
    }

    // Return operation info - caller should poll for completion
    return {
      operationName,
      status: 'PROCESSING',
      message: 'Video generation started. Poll the operation endpoint to check status.',
      // Use the full operation name as returned by the API
      statusUrl: `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/${operationName}`
    };

  } catch (err) {
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
        message: `Veo model "${selectedModel}" not available in region "${GCP_LOCATION}". The model may not be enabled or not supported in this region.`,
        videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4'
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

    const response = await axios.post(fetchUrl, {
      operationName: operationName
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const operation = response.data;

    // Check if operation is complete
    if (operation.done) {
      // Success case - check for response with videos array (official format from documentation)
      if (operation.response && operation.response.videos) {
        const videos = operation.response.videos.map((video, index) => {
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
        // Provide helpful error messages based on error code
        let errorMessage = operation.error.message || JSON.stringify(operation.error);
        let suggestion = '';
        
        if (operation.error.code === 13) {
          suggestion = 'Internal error from Veo API. Possible causes: content policy violation, model availability, or GCS bucket permissions.';
        } else if (operation.error.code === 7) {
          suggestion = 'Permission denied. Ensure service account has roles/aiplatform.user and roles/storage.objectCreator.';
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
      console.error('Operation not found (404):', operationName);
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
      
      // Poll for completion
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const status = await getVideoOperationStatus(result.operationName);
        
        if (status.status === 'COMPLETED') {
          return {
            ...result,
            ...status,
            status: 'COMPLETED',
            retriesUsed: retry,
            successStrategy: retry > 0 ? retryStrategies[Math.min(retry, retryStrategies.length - 1)].name : 'Original'
          };
        }
        
        if (status.status === 'FAILED') {
          // Check if error is retryable (code 13 = internal error)
          if (status.errorCode === 13 && retry < maxRetries) {
            lastError = status;
            break; // Break inner loop to retry
          }
          
          // Non-retryable error or max retries reached
          const errorMsg = status.suggestion 
            ? `${status.error}\n\n${status.suggestion}`
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

// Configuration debugging (only runs when executed directly)
if (require.main === module) {
  // List available Gemini models
  listModels(GEMINI_API_KEY)
    .catch(err => {
      console.error('Gemini API Key error:', err.message);
    });
}