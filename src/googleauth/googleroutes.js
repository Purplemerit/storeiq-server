const express = require("express");
const router = express.Router();
const passport = require("../googleauth/googlestrategy");
const jwt = require("jsonwebtoken");

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

const FRONTEND_URL = process.env.FRONTEND_URL

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user._id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // redirect with token as query param
    // Use full URL from FRONTEND_URL (e.g., http://localhost:8080)
    res.redirect(`${FRONTEND_URL}/dashboard?token=${token}`);
  }
);

router.get("/logout", (req, res) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

module.exports = router;
