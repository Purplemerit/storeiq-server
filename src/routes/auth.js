// Dependencies
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("./authMiddleware");

const googleAuthRouter = require("../googleauth/googleroutes");
const facebookAuthRouter = require("../facebookauth/facebookroutes");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Helper: Validate email format
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Helper: Validate password strength (min 8 chars)
function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

// Register route
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (typeof username !== "string" || !isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      username,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
    const cookieOptions =
      process.env.NODE_ENV === "production"
        ? {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
          }
        : {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
          };
    res.cookie("token", token, cookieOptions);
    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, username: user.username, avatar: user.avatar },
    });
  } catch (err) {
    console.error("[REGISTER ERROR]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
    const cookieOptions =
      process.env.NODE_ENV === "production"
        ? {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
          }
        : {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
          };
    res.cookie("token", token, cookieOptions);
    res.json({
      token,
      user: { id: user._id, email: user.email, username: user.username, avatar: user.avatar },
    });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Protected route
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("id _id email username timezone avatar");
    if (!user) return res.status(404).json({ error: "User not found" });
    // Only expose safe fields
    const safeUser = {
      id: user._id,
      email: user.email,
      username: user.username,
      timezone: user.timezone,
      avatar: user.avatar,
    };
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /me - update user's timezone
router.patch("/me", authMiddleware, async (req, res) => {
  try {
    const { timezone } = req.body;
    if (typeof timezone !== "string" || timezone.length < 1 || timezone.length > 100) {
      return res.status(400).json({ error: "Invalid timezone" });
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { timezone, updatedAt: new Date() },
      { new: true, select: "id _id email username timezone" }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        timezone: user.timezone,
      },
      message: "Timezone updated",
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
/**
 * PATCH /auth/password - update user password
 * Requires: { currentPassword, newPassword }
 */
router.patch("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }
    const user = await User.findById(req.user._id);
    if (!user || !user.password) {
      return res.status(404).json({ error: "User not found or password not set." });
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    user.password = await bcrypt.hash(newPassword, 12);
    user.updatedAt = new Date();
    await user.save();
    res.json({ message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Requires: { accessToken, refreshToken } in body
 * Stores tokens in logged-in user's record
 */
router.post("/link-youtube", authMiddleware, async (req, res) => {
  try {
  const { accessToken, refreshToken } = req.body;

    if (typeof accessToken !== "string" || !accessToken) {
      return res.status(400).json({ error: "Missing or invalid accessToken" });
    }

    const userId = req.user._id;
    const setFields = {
      googleAccessToken: accessToken,
      updatedAt: new Date(),
    };
    if (typeof refreshToken === "string" && refreshToken) {
      setFields.googleRefreshToken = refreshToken;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: setFields },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }


    res.json({ message: "YouTube tokens linked successfully" });
  } catch (err) {
    console.error("[LINK YOUTUBE ERROR]", err);
    res.status(500).json({ error: "Server error" });
  }
});


// GET /api/auth/status - returns YouTube connection status
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const user = await User.getTokensById(req.user._id);
    
    if (user && user.googleAccessToken) {
      // Setup OAuth2 client
      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_CALLBACK_URL
      );
      
      // Set credentials including refresh token if available
      const credentials = {
        access_token: user.googleAccessToken
      };
      if (user.googleRefreshToken) {
        credentials.refresh_token = user.googleRefreshToken;
      }
      oauth2Client.setCredentials(credentials);
      
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      
      try {
        // Make a simple API call to test the token
        await youtube.channels.list({ part: 'snippet', mine: true });
        res.json({ youtube: true });
      } catch (apiError) {
        // Try to refresh token if we have a refresh token
        if (user.googleRefreshToken) {
          try {
            const { tokens } = await oauth2Client.refreshToken(user.googleRefreshToken);
            // Update tokens in database
            await User.findByIdAndUpdate(req.user._id, {
              googleAccessToken: tokens.access_token,
              ...(tokens.refresh_token && { googleRefreshToken: tokens.refresh_token })
            });
            res.json({ youtube: true });
            return;
          } catch (refreshError) {
            console.error('[/auth/status] Token refresh failed:', refreshError);
            // Clear invalid tokens
            await User.findByIdAndUpdate(
              req.user._id,
              { $unset: { googleAccessToken: "", googleRefreshToken: "" } }
            );
          }
        } else {
          // No refresh token available, clear access token
          await User.findByIdAndUpdate(
            req.user._id,
            { $unset: { googleAccessToken: "" } }
          );
        }
        res.json({ youtube: false });
      }
    } else {
      res.json({ youtube: false });
    }
  } catch (err) {
    console.error('[/auth/status] Error:', err);
    res.status(500).json({ error: "Server error" });
  }
});


/**
 * POST /api/auth/disconnect-youtube
 * Removes YouTube tokens from the user's record
 */
router.post("/disconnect-youtube", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const updateFields = {
      googleAccessToken: undefined,
      googleRefreshToken: undefined,
      updatedAt: new Date(),
    };
    const user = await User.findByIdAndUpdate(
      userId,
      { $unset: { googleAccessToken: "", googleRefreshToken: "" }, $set: { updatedAt: new Date() } },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ message: "YouTube disconnected successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.use("/instagram", facebookAuthRouter);

module.exports = router;
