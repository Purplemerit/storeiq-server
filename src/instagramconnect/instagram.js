const express = require("express");
const axios = require("axios");

const router = express.Router();

// === 1. Start OAuth ===
router.get("/auth/instagram", (req, res) => {
  const redirectUri = encodeURIComponent(process.env.FB_REDIRECT_URI);
  const clientId = process.env.FB_APP_ID;

  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement`;
  res.redirect(authUrl);
});

// === 2. OAuth Callback ===
router.get("/auth/instagram/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const tokenRes = await axios.get(`https://graph.facebook.com/v21.0/oauth/access_token`, {
      params: {
        client_id: process.env.FB_APP_ID,
        client_secret: process.env.FB_APP_SECRET,
        redirect_uri: process.env.FB_REDIRECT_URI,
        code,
      },
    });

    const accessToken = tokenRes.data.access_token;
    res.cookie("fb_token", accessToken, { httpOnly: true });
    res.send("✅ Instagram connected successfully!");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("OAuth failed");
  }
});

// === 3. Get IG Business Account ===
router.get("/instagram/account", async (req, res) => {
  const token = req.cookies.fb_token;
  if (!token) return res.status(401).send("Not authenticated");

  try {
    const pagesRes = await axios.get(`https://graph.facebook.com/v21.0/me/accounts`, {
      params: { access_token: token },
    });

    const pages = pagesRes.data.data;
    if (!pages.length) return res.status(400).send("No pages found");

    const pageId = pages[0].id;

    const igRes = await axios.get(`https://graph.facebook.com/v21.0/${pageId}`, {
      params: { fields: "instagram_business_account", access_token: token },
    });

    const igUserId = igRes.data.instagram_business_account?.id;
    if (!igUserId) return res.status(400).send("No IG business account found");

    res.json({ igUserId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Failed to fetch IG account");
  }
});

// === 4. Upload Video (Create Media Container) ===
router.post("/instagram/upload", async (req, res) => {
  const token = req.cookies.fb_token;
  if (!token) return res.status(401).send("Not authenticated");

  const { igUserId, videoUrl, caption } = req.body;

  try {
    // Step 1: Create video container
    const uploadRes = await axios.post(
      `https://graph.facebook.com/v21.0/${igUserId}/media`,
      null,
      {
        params: {
          media_type: "VIDEO",
          video_url: videoUrl,
          caption: caption || "",
          access_token: token,
        },
      }
    );

    const containerId = uploadRes.data.id;

    // Step 2: Poll status until "FINISHED"
    let status = "IN_PROGRESS";
    while (status === "IN_PROGRESS") {
      const statusRes = await axios.get(
        `https://graph.facebook.com/v21.0/${containerId}`,
        { params: { fields: "status_code", access_token: token } }
      );

      status = statusRes.data.status_code;
      if (status === "IN_PROGRESS") {
        await new Promise((r) => setTimeout(r, 3000)); // wait 3 sec
      }
    }

    if (status !== "FINISHED") {
      return res.status(400).send("Video processing failed");
    }

    res.json({ containerId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Failed to upload video");
  }
});

// === 5. Publish Video ===
router.post("/instagram/publish", async (req, res) => {
  const token = req.cookies.fb_token;
  if (!token) return res.status(401).send("Not authenticated");

  const { igUserId, containerId } = req.body;

  try {
    const publishRes = await axios.post(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: token,
        },
      }
    );

    res.json({ postId: publishRes.data.id });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Failed to publish video");
  }
});

module.exports = router;
