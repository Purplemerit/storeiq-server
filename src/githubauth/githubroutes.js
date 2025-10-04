const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const passport = require("passport");
require("../githubauth/githubStrategy");

const FRONTEND_URL = process.env.FRONTEND_URL;

// --- GITHUB LOGIN ---
router.get(
  "/github/login",
  passport.authenticate("github", {
    scope: ["user:email"],
    state: "login",
  })
);

// --- GITHUB REGISTER ---
router.get(
  "/github/register",
  passport.authenticate("github", {
    scope: ["user:email"],
    state: "register",
  })
);

// --- GITHUB CALLBACK ---
router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/",session: false }),
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
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge:  24 * 60 * 60 * 1000,
    });
    res.redirect(`${FRONTEND_URL}/dashboard`);
  }
);

module.exports = router;
