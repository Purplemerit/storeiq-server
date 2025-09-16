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
    // Remove data URL prefix if present
    const base64 = videoBase64.replace(/^data:video\/mp4;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    const timestamp = Date.now();
    const random = crypto.randomBytes(6).toString('hex');
    const key = `video-${timestamp}-${random}.mp4`;

    const command = new PutObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'video/mp4',
      ACL: 'public-read',
    });

    await s3.send(command);

    const url = `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    return url;
  } catch (err) {
    console.error('S3 upload error:', err);
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
    console.error('S3 delete error:', err);
    throw new Error('Failed to delete video from S3');
  }
}

module.exports = { uploadVideoBase64, deleteVideoFromS3 };