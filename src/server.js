require('dotenv').config();
const mongoose = require('mongoose');
const session = require("express-session");
const passport = require("passport");
require("./googleauth/googlestrategy");
require("./githubauth/githubStrategy");
require("./facebookauth/facebookStrategy");

// Import express
const express = require("express");

// Initialize express app
const app = express();

// Import all routes
const routes = require("./routes");
const googleRoutes = require("../src/googleauth/googleroutes");
const githubroutes = require("../src/githubauth/githubroutes");
const facebookroutes = require("../src/facebookauth/facebookroutes");
// Define a port
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(express.json());
//session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
  })
);
// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Mount all routes at /api
app.use("/api", routes);
app.use("/auth", googleRoutes);
app.use("/auth", githubroutes);
app.use("/auth", facebookroutes);
// Basic route
app.get("/", (req, res) => {
  res.send("Backend server is running 🚀");
});
app.get("/dashboard", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/auth/google");
  }
  res.send(`Hello, ${req.user.displayName}`);
});
// Connect to MongoDB and start server
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
