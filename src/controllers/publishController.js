const stream = require("stream");
// Controller for publishing videos to YouTube and Instagram using stored tokens
const User = require("../models/User");
const s3Service = require("../s3Service");
const Video = require("../models/Video");
const { google } = require("googleapis");
const axios = require("axios");
const schedulingService = require("../services/schedulingService");

// Export the publishVideoToYouTube function for use by other modules
exports.publishVideoToYouTube = publishVideoToYouTube;

// Utility function to publish video to YouTube
async function publishVideoToYouTube(userId, s3Key, metadata = {}) {
  console.log(`[publishVideoToYouTube] Starting upload for user ${userId}, s3Key: ${s3Key}`);
  
  const user = await User.findById(userId).select("+googleAccessToken");
  let googleAccessToken = user && user.googleAccessToken;
  
  if (!googleAccessToken && user && typeof user.get === "function") {
    console.log('[publishVideoToYouTube] Attempting to get raw token...');
    const rawToken = user.get("googleAccessToken", null, { getters: false });
    if (rawToken) {
      console.log('[publishVideoToYouTube] Found raw token');
      googleAccessToken = rawToken;
    }
  }

  if (!googleAccessToken && user) {
    const mongoose = require("mongoose");
    const nativeUser = await mongoose.connection.db
      .collection("users")
      .findOne({ _id: user._id }, { projection: { googleAccessToken: 1 } });
    if (nativeUser && nativeUser.googleAccessToken) {
      googleAccessToken = nativeUser.googleAccessToken;
    }
  }

  if (!user || !googleAccessToken) {
    console.error('[publishVideoToYouTube] No user or access token found');
    throw new Error("YouTube account not linked.");
  }

  console.log('[publishVideoToYouTube] Fetching video from S3...');
  const videoBuffer = await s3Service.getFileBuffer(s3Key);
  console.log('[publishVideoToYouTube] Video fetched successfully');
  const { OAuth2 } = google.auth;
  const oauth2Client = new OAuth2();
  oauth2Client.setCredentials({ access_token: googleAccessToken });
  
  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  const { title, description } = metadata;
  const media = {
    body: Buffer.isBuffer(videoBuffer)
      ? stream.Readable.from(videoBuffer)
      : stream.Readable.from(Buffer.from(videoBuffer)),
  };

  const requestBody = {
    snippet: {
      title: title || "Untitled Video",
      description: description || "",
    },
    status: {
      privacyStatus: "private",
    },
  };

  console.log('[publishVideoToYouTube] Initiating YouTube upload...');
  const response = await youtube.videos.insert({
    part: "snippet,status",
    requestBody,
    media: {
      body: media.body,
    },
  });
  console.log('[publishVideoToYouTube] Upload successful, video ID:', response.data.id);

  // Update video tracking
  console.log('[publishVideoToYouTube] Updating video tracking...');
  let videoDoc = await Video.findOne({ s3Key, owner: userId });
  if (!videoDoc) {
    videoDoc = new Video({
      s3Key,
      owner: userId,
      title: title || "Untitled Video",
      description: description || ""
    });
  }
  videoDoc.publishCount = (videoDoc.publishCount || 0) + 1;
  videoDoc.publishedToYouTube = true;
  await videoDoc.save();

  return response.data.id;
}

// POST /api/publish/youtube
exports.publishToYouTube = async (req, res) => {
  try {
    // Enforce user-level access: s3Key must start with videos/{username}/
    const username = req.user && req.user.username ? req.user.username : null;
    const expectedPrefix = username ? `videos/${username}/` : req.user._id;
    if (!req.body.s3Key || typeof req.body.s3Key !== "string" || !req.body.s3Key.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: "Unauthorized: You do not have permission to publish this video." });
    }

    // Check if this is a scheduled publish
    if (req.body.scheduledTime) {
      const scheduledPost = await schedulingService.createScheduledPost(
        req.user._id,
        req.body.s3Key,
        req.body.scheduledTime,
        req.body.timezone || 'UTC'
      );
      return res.status(201).json({
        success: true,
        message: "Video scheduled for publishing",
        scheduledPost
      });
    }

    // Immediate publish
    const videoId = await publishVideoToYouTube(req.user._id, req.body.s3Key, req.body.metadata);
    return res.json({
      success: true,
      message: "Video posted to YouTube.",
      videoId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /api/publish/instagram
exports.publishToInstagram = async (req, res) => {
  // Debug: Log incoming req.user
  console.log('[publishToInstagram] Incoming req.user:', req.user);
  try {
    // Enforce user-level access: s3Key must start with videos/{username}/
    const username = req.user && req.user.username ? req.user.username : null;
    const expectedPrefix = username ? `videos/${username}/` : req.user.id;
    if (!req.body.s3Key || typeof req.body.s3Key !== "string" || !req.body.s3Key.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: "Unauthorized: You do not have permission to publish this video." });
    }
    const user = await User.findById(req.user.id);
    // Debug: Log result of user lookup
    console.log('[publishToInstagram] User lookup result:', user);
    if (!user || !user.facebookAccessToken) {
      return res.status(401).json({ error: "Instagram account not linked." });
    }
    // Fetch video file from S3 (filename in req.body.s3Key)
    const videoBuffer = await s3Service.getFileBuffer(req.body.s3Key);
    const { caption } = req.body.metadata || {};
    // 1. Get user's Instagram business account ID
    let igUserId;
    try {
      const fbMeRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${user.facebookAccessToken}`
      );
      const page = fbMeRes.data.data?.[0];
      if (!page) throw new Error("No linked Facebook Page found.");
      const pageId = page.id;
      const pageToken = page.access_token;
      const igRes = await axios.get(
        `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
      );
      igUserId = igRes.data.instagram_business_account?.id;
      if (!igUserId) throw new Error("No linked Instagram business account found.");
    
      // 2. Upload video to Instagram container
      // First, upload video to a public S3 URL
      const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.body.s3Key}`;
      const containerRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          media_type: "VIDEO",
          video_url: s3Url,
          caption: caption || "",
          access_token: pageToken,
        }
      );
      const creationId = containerRes.data.id;
    
      // 3. Publish the container
      await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        {
          creation_id: creationId,
          access_token: pageToken,
        }
      );
      return res.json({ success: true, message: "Video posted to Instagram." });
    } catch (err) {
      return res.status(500).json({ error: "Instagram upload failed", details: err.message });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};