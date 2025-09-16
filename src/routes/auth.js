// Dependencies
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
// Mongoose User model
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt:{ type: Date, default: Date.now },
  updatedAt:{ type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

const router = express.Router();

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET;

// Helper: Validate email format
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Helper: Validate password strength (min 8 chars)
function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

const authMiddleware = require('./authMiddleware');

// Register route
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (
      typeof username !== "string" ||
      !isValidEmail(email) ||
      !isValidPassword(password)
    ) {
      return res.status(400).json({ error: "Invalid input" });
    }
    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: "Invalid input" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Protected route
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;