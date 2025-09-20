const express = require("express");
const router = express.Router();
const passport = require("passport");
require("../googleauth/googlestrategy");
const jwt = require("jsonwebtoken");

const FRONTEND_URL = process.env.FRONTEND_URL;

// --- GOOGLE LOGIN ---
router.get(
  "/google/login",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/youtube.upload"
    ],
    state: "login",
  })
);

// --- GOOGLE REGISTER ---
router.get(
  "/google/register",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/youtube.upload"
    ],
    state: "register",
  })
);

// --- YOUTUBE CONNECT (for linking YouTube to existing account) ---

// --- GOOGLE CALLBACK ---
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" ,session: false}),
  (req, res) => {
    if (!req.user) {
      return res.redirect(`${FRONTEND_URL}/login?error=NoAccount`);
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Send as secure cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // only true in production
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);
  }
);

// --- LOGOUT (clear cookie instead of passport logout) ---
router.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

module.exports = router;
