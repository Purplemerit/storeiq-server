// Shared Google Cloud Authentication utility
const { GoogleAuth } = require('google-auth-library');

let googleAuth = null;
let isInitialized = false;

/**
 * Initialize Google Auth with proper credential handling for both local and deployment environments
 */
function initializeGoogleAuth() {
  if (isInitialized) {
    return googleAuth;
  }

  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      // For Render deployment - JSON credentials from environment variable
      console.log('🔐 Initializing Google Auth with service account JSON from env var');
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      googleAuth = new GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // For local development - file path to service account JSON
      console.log('🔐 Initializing Google Auth with service account file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      googleAuth = new GoogleAuth({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
    } else {
      console.warn('⚠️ No Google Cloud authentication configured. Set either GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS');
      googleAuth = null;
    }
    isInitialized = true;
  } catch (err) {
    console.error('❌ Google Auth initialization failed:', err.message);
    console.warn('⚠️ Google Cloud services will not be available');
    googleAuth = null;
    isInitialized = true;
  }

  return googleAuth;
}

/**
 * Get Google Cloud access token
 */
async function getAccessToken() {
  const auth = initializeGoogleAuth();
  
  if (!auth) {
    throw new Error('Google Auth not initialized. Set either GOOGLE_SERVICE_ACCOUNT_KEY (for deployment) or GOOGLE_APPLICATION_CREDENTIALS (for local dev) in your .env file.');
  }

  try {
    const client = await auth.getClient();
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
 * Get Google Auth client instance
 */
async function getGoogleAuthClient() {
  const auth = initializeGoogleAuth();
  
  if (!auth) {
    throw new Error('Google Auth not initialized. Set either GOOGLE_SERVICE_ACCOUNT_KEY (for deployment) or GOOGLE_APPLICATION_CREDENTIALS (for local dev) in your .env file.');
  }

  return await auth.getClient();
}

/**
 * Check if Google Auth is properly configured
 */
function isGoogleAuthConfigured() {
  const auth = initializeGoogleAuth();
  return auth !== null;
}

module.exports = {
  initializeGoogleAuth,
  getAccessToken,
  getGoogleAuthClient,
  isGoogleAuthConfigured
};