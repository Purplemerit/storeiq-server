// Cloudinary video upload service
const axios = require('axios');

const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
if (!CLOUDINARY_URL) throw new Error('CLOUDINARY_URL not set in environment');

async function uploadVideoBase64(videoBase64) {
  try {
    // Cloudinary expects base64 data as 'file', and 'upload_preset' if configured
    const formData = new URLSearchParams();
    formData.append('file', `data:video/mp4;base64,${videoBase64}`);
    formData.append('resource_type', 'video');

    const response = await axios.post(
      CLOUDINARY_URL,
      formData,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    const videoUrl = response.data?.secure_url;
    if (!videoUrl) throw new Error('No video URL returned from Cloudinary');
    return videoUrl;
  } catch (err) {
    throw new Error('Cloudinary upload error: ' + (err.response?.data?.error?.message || err.message));
  }
}

module.exports = { uploadVideoBase64 };