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
    ],
    state: "register",
  })
);

// --- YOUTUBE CONNECT (for linking YouTube to existing account) ---

// --- GOOGLE CALLBACK ---
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/", session: false }),
  async (req, res) => {
    if (!req.user) {
      return res.redirect(`${FRONTEND_URL}/login?error=NoAccount`);
    }


    // Default: normal login/signup with Google
    const token = jwt.sign(
      {
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.redirect(`${FRONTEND_URL}/dashboard?logged_in=1`);
  }
);

// --- LOGOUT (clear cookie instead of passport logout) ---
router.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

module.exports = router;
