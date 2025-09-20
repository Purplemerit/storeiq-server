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
    res.cookie("token", token, {
      httpOnly: true,                     // JS can't access it
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      sameSite: "strict",                  // CSRF protection
      maxAge: 24 * 60 * 60 * 1000,         // 1 day
      path: "/",                           
      
    });
    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, username: user.username },
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
    res.cookie("token", token, {
      httpOnly: true,                     // JS can't access it
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      sameSite: "strict",                  // CSRF protection
      maxAge: 24 * 60 * 60 * 1000,         // 1 day
      path: "/",                           
      
    });
    res.json({
      token,
      user: { id: user._id, email: user.email, username: user.username },
    });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Protected route
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("id _id email username timezone");
    if (!user) return res.status(404).json({ error: "User not found" });
    // Only expose safe fields
    const safeUser = {
      id: user._id,
      email: user.email,
      username: user.username,
      timezone: user.timezone,
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


const passport = require("passport");

// Initiate YouTube OAuth flow for connecting YouTube account
router.get(
 "/youtube",
 passport.authenticate("google", {
   scope: [
     "profile",
     "email",
     "https://www.googleapis.com/auth/youtube.upload"
   ],
   state: "connect",
   prompt: "consent", // force consent screen for re-auth
   accessType: "offline"
 })
);

router.use("/youtube", googleAuthRouter);
router.use("/instagram", facebookAuthRouter);

module.exports = router;
