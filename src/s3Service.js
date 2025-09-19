// server/src/s3Service.js
require('dotenv').config({ path: __dirname + '/../.env' });

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { PutObjectCommand: PresignPutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

// Multipart upload imports
const {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');

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
async function uploadVideoBuffer(buffer, mimetype, userId, metadata = {}) {
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
    console.log('[S3][UPLOAD] userId:', userId, 'key:', key);

    const command = new PutObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype || 'video/mp4',
      Metadata: metadata,
    });

    await s3.send(command);

    const url = `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    console.log('[S3][UPLOAD] Uploaded to:', url);
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
const { HeadObjectCommand } = require('@aws-sdk/client-s3');

async function listUserVideosFromS3(userId) {
  if (!userId) throw new Error('userId is required');
  // Assuming videos are stored with a prefix per user, e.g. "videos/{userId}/"
  const prefix = `videos/${userId}/`;
  const command = new ListObjectsV2Command({
    Bucket: AWS_BUCKET_NAME,
    Prefix: prefix,
  });
  try {
    const data = await s3.send(command);
    if (!data.Contents) {
      return [];
    }
    // Fetch metadata for each video (parallel)
    const mapped = await Promise.all(
      data.Contents.map(async (obj) => {
        let isEdited = false;
        try {
          const head = await s3.send(new HeadObjectCommand({
            Bucket: AWS_BUCKET_NAME,
            Key: obj.Key,
          }));
          if (head.Metadata && head.Metadata.edited === "true") {
            isEdited = true;
          }
        } catch (e) {
          console.error('[S3][DEBUG] Failed to fetch metadata for', obj.Key, e);
        }
        return {
          key: obj.Key,
          s3Url: `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${obj.Key}`,
          title: obj.Key.split('/').pop(),
          createdAt: obj.LastModified,
          size: obj.Size,
          isEdited,
          // Thumbnail logic can be added if thumbnails are stored with a convention
        };
      })
    );
    return mapped;
  } catch (err) {
    console.error('[S3] Error listing user videos:', err);
    throw new Error('Failed to list user videos from S3');
  }
}

/**
 * Generates a pre-signed S3 URL for uploading a video file.
 * @param {string} filename - The original filename (for extension).
 * @param {string} contentType - The MIME type of the file.
 * @param {string} userId - The user's ID for key prefixing.
 * @returns {Promise<{ url: string, key: string }>}
 */
const { GetObjectCommand } = require('@aws-sdk/client-s3');

async function generatePresignedUrl(filename, contentType, userId) {
  if (!userId) throw new Error('userId is required for presigned URL');
  if (!filename) throw new Error('filename is required');
  if (!contentType) throw new Error('contentType is required');
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString('hex');
  const ext = filename.split('.').pop() || 'mp4';
  const key = `videos/${userId}/video-${timestamp}-${random}.${ext}`;
  const putCommand = new PresignPutObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, putCommand, { expiresIn: 900 }); // 15 min

  // Generate presigned GET URL for the uploaded file (valid for 1 hour)
  const getCommand = new GetObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
  });
  const fileUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 }); // 1 hour

  return { url, fileUrl, key };
}

/**
 * Initiates a multipart upload and returns { uploadId, key }
 * @param {string} filename
 * @param {string} contentType
 * @param {string} userId
 */
async function initiateMultipartUpload(filename, contentType, userId) {
  if (!userId) throw new Error('userId is required');
  if (!filename) throw new Error('filename is required');
  if (!contentType) throw new Error('contentType is required');
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString('hex');
  const ext = filename.split('.').pop() || 'mp4';
  const key = `videos/${userId}/video-${timestamp}-${random}.${ext}`;
  const command = new CreateMultipartUploadCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  const result = await s3.send(command);
  return { uploadId: result.UploadId, key };
}

/**
 * Generates presigned URLs for uploading parts.
 * @param {string} key
 * @param {string} uploadId
 * @param {number[]} partNumbers
 * @param {string} contentType
 * @returns {Promise<Array<{ partNumber: number, url: string }>>}
 */
async function generateMultipartPresignedUrls(key, uploadId, partNumbers, contentType) {
  if (!key || !uploadId || !Array.isArray(partNumbers)) throw new Error('Missing required params');
  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: key,
        PartNumber: partNumber,
        UploadId: uploadId,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3, command, { expiresIn: 900 });
      return { partNumber, url };
    })
  );
  return urls;
}

/**
 * Completes a multipart upload.
 * @param {string} key
 * @param {string} uploadId
 * @param {Array<{ ETag: string, PartNumber: number }>} parts
 * @returns {Promise<{ fileUrl: string }>}
 */
async function completeMultipartUpload(key, uploadId, parts) {
  if (!key || !uploadId || !Array.isArray(parts)) throw new Error('Missing required params');
  // Parts must be sorted by PartNumber
  const sortedParts = parts.slice().sort((a, b) => a.PartNumber - b.PartNumber);
  const command = new CompleteMultipartUploadCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: sortedParts },
  });
  await s3.send(command);
  const fileUrl = `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  return { fileUrl };
}

/**
 * Aborts a multipart upload.
 * @param {string} key
 * @param {string} uploadId
 */
async function abortMultipartUpload(key, uploadId) {
  if (!key || !uploadId) throw new Error('Missing required params');
  const command = new AbortMultipartUploadCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
  });
  await s3.send(command);
}

module.exports = {
  uploadVideoBase64,
  uploadVideoBuffer,
  deleteVideoFromS3,
  listUserVideosFromS3,
  generatePresignedUrl,
  initiateMultipartUpload,
  generateMultipartPresignedUrls,
  completeMultipartUpload,
  abortMultipartUpload,
};