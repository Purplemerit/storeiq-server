const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const passport = require("passport");
require("../githubauth/githubStrategy");
const FRONTEND_URL = process.env.FRONTEND_URL;

// Start OAuth
router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));

// Callback
router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  (req, res) => {
    const user = req.user; // Mongoose document

    // pick only the fields you want
    const payload = {
      id: user._id,
      email: user.email,
      username: user.username
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.redirect(`${FRONTEND_URL}/dashboard?token=${token}`);
  }
);

module.exports = router;
