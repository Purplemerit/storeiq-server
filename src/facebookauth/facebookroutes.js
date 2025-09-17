const express = require("express");
const router = express.Router();
const passport = require("passport");
const jwt = require("jsonwebtoken");
require("../facebookauth/facebookStrategy"); // your Facebook strategy
const FRONTEND_URL = process.env.FRONTEND_URL;

// Start Facebook OAuth
router.get("/facebook", passport.authenticate("facebook", { scope: ["email"] }));

// Callback
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/" }),
  (req, res) => {
    const user = req.user; // Mongoose document

    // pick only the fields you want
    const payload = {
      id: user._id,
      email: user.email,
      username: user.username
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

    // redirect to frontend with token
    res.redirect(`${FRONTEND_URL}/dashboard?token=${token}`);
  }
);

module.exports = router;
