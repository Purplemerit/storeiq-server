// server/src/s3Service.js

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_BUCKET_NAME,
} = process.env;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_BUCKET_NAME) {
  throw new Error('Missing AWS S3 environment variables.');
}

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads a base64-encoded MP4 video to S3 and returns the public URL.
 * @param {string} videoBase64 - Base64-encoded MP4 string.
 * @returns {Promise<string>} - Public S3 URL of the uploaded video.
 */
/**
 * Uploads a base64-encoded MP4 video to S3 and returns the public URL.
 * @param {string} videoBase64 - Base64-encoded MP4 string.
 * @param {string} userId - MongoDB ObjectId of the authenticated user.
 * @returns {Promise<string>} - Public S3 URL of the uploaded video.
 */
async function uploadVideoBase64(videoBase64, userId) {
  if (!userId) {
    throw new Error('userId is required for video upload');
  }
  try {
    // Extract mimetype if present in data URL, default to video/mp4
    let mimetype = 'video/mp4';
    let base64 = videoBase64;
    const match = videoBase64.match(/^data:(video\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (match) {
      mimetype = match[1];
      base64 = match[2];
    } else {
      // Remove mp4 prefix if present
      base64 = videoBase64.replace(/^data:video\/mp4;base64,/, '');
    }
    const buffer = Buffer.from(base64, 'base64');

    const timestamp = Date.now();
    const random = crypto.randomBytes(6).toString('hex');
    // Use extension from mimetype if possible, fallback to .mp4
    let ext = 'mp4';
    if (mimetype && mimetype.split('/')[1]) {
      ext = mimetype.split('/')[1];
    }
    // S3 does not require manual folder creation. Using a prefix like 'videos/{userId}/' in the object key
    // will automatically organize files in a virtual folder structure in the S3 console. No explicit folder
    // creation is needed—just set the key as 'videos/{userId}/{filename}' and S3 handles the rest.
    const key = `videos/${userId}/video-${timestamp}-${random}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    });

    await s3.send(command);

    const url = `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    return url;
  } catch (err) {
    throw new Error('Failed to upload video to S3');
  }
}

/**
 * Uploads a video buffer to S3 and returns the public URL and key.
 * @param {Buffer} buffer - Video file buffer.
 * @param {string} mimetype - MIME type of the video.
 * @returns {Promise<{ url: string, key: string }>}
 */
/**
 * Uploads a video buffer to S3 and returns the public URL and key.
 * @param {Buffer} buffer - Video file buffer.
 * @param {string} mimetype - MIME type of the video.
 * @param {string} userId - MongoDB ObjectId of the authenticated user.
 * @returns {Promise<{ url: string, key: string }>}
 */
async function uploadVideoBuffer(buffer, mimetype, userId) {
  if (!userId) {
    throw new Error('userId is required for video upload');
  }
  try {
    const timestamp = Date.now();
    const random = crypto.randomBytes(6).toString('hex');
    // Use extension from mimetype if possible, fallback to .mp4
    let ext = 'mp4';
    if (mimetype && mimetype.split('/')[1]) {
      ext = mimetype.split('/')[1];
    }
    const key = `videos/${userId}/video-${timestamp}-${random}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype || 'video/mp4',
    });

    await s3.send(command);

    const url = `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    return { url, key };
  } catch (err) {
    throw new Error('Failed to upload video to S3');
  }
}

/**
 * Deletes a video from S3 by key.
 * @param {string} key - The S3 object key to delete.
 * @returns {Promise<void>}
 */
async function deleteVideoFromS3(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
  } catch (err) {
    throw new Error('Failed to delete video from S3');
  }
}

const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

/**
 * Lists all videos for a user from S3.
 * @param {string} userId
 * @returns {Promise<Array>} Array of video metadata objects
 */
async function listUserVideosFromS3(userId) {
  if (!userId) throw new Error('userId is required');
  // Assuming videos are stored with a prefix per user, e.g. "videos/{userId}/"
  const prefix = `videos/${userId}/`;
  console.log('[S3] Listing videos with prefix:', prefix);
  const command = new ListObjectsV2Command({
    Bucket: AWS_BUCKET_NAME,
    Prefix: prefix,
  });
  try {
    const data = await s3.send(command);
    console.log('[S3] Raw ListObjectsV2Command response:', JSON.stringify(data, null, 2));
    if (!data.Contents) {
      console.log('[S3] No videos found for user:', userId);
      return [];
    }
    const mapped = data.Contents.map(obj => ({
      key: obj.Key,
      s3Url: `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${obj.Key}`,
      title: obj.Key.split('/').pop(),
      createdAt: obj.LastModified,
      size: obj.Size,
      // Thumbnail logic can be added if thumbnails are stored with a convention
    }));
    console.log('[S3] Mapped video objects:', JSON.stringify(mapped, null, 2));
    return mapped;
  } catch (err) {
    console.error('[S3] Error listing user videos:', err);
    throw new Error('Failed to list user videos from S3');
  }
}

module.exports = { uploadVideoBase64, uploadVideoBuffer, deleteVideoFromS3, listUserVideosFromS3 };