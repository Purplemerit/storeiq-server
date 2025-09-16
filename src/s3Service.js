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
async function uploadVideoBase64(videoBase64) {
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
    const key = `video-${timestamp}-${random}.${ext}`;

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
async function uploadVideoBuffer(buffer, mimetype) {
  try {
    const timestamp = Date.now();
    const random = crypto.randomBytes(6).toString('hex');
    // Use extension from mimetype if possible, fallback to .mp4
    let ext = 'mp4';
    if (mimetype && mimetype.split('/')[1]) {
      ext = mimetype.split('/')[1];
    }
    const key = `video-${timestamp}-${random}.${ext}`;

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

module.exports = { uploadVideoBase64, uploadVideoBuffer, deleteVideoFromS3 };