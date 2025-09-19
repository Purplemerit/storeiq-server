const express = require("express");
const router = express.Router();
const passport = require("passport");
const jwt = require("jsonwebtoken");
require("../facebookauth/facebookStrategy"); // unified Facebook strategy
const FRONTEND_URL = process.env.FRONTEND_URL;

// --- FACEBOOK LOGIN ---
router.get(
  "/facebook/login",
  passport.authenticate("facebook", {
    scope: [
      "email",
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_content_publish"
    ],
    state: "login",
  })
);

// --- FACEBOOK REGISTER ---
router.get(
  "/facebook/register",
  passport.authenticate("facebook", {
    scope: [
      "email",
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_content_publish"
    ],
    state: "register",
  })
);

// --- FACEBOOK CALLBACK ---
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/",session: false }),
  (req, res) => {
    if (!req.user) {
      return res.redirect(`${FRONTEND_URL}/login?error=NoAccount`);
    }

    const user = req.user; // Mongoose document
    const payload = {
      id: user._id,
      email: user.email,
      username: user.username,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

   
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.redirect(`${FRONTEND_URL}/dashboard`);
  }
);

module.exports = router;
