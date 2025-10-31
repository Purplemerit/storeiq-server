require("dotenv").config();
const mongoose = require("mongoose");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const aiRoutes = require("./routes/ai");
const youtubeRoutes = require('./youtube/youtubeRoutes');
const scheduleRoutes = require('./routes/schedule');
const videoTTSRoutes = require("../src/ai-tools/text-audio");
const videoMountingRoutes = require("../src/ai-tools/videoMounting");
const uploadAudioRoutes = require("./ai-tools/uploadAudio");
const instagramRoutes = require("../src/instagramconnect/instagram");


const geminiRoutes = require("../src/aimodel/routes");
const aimobRoutes = require("../src/ai-tools/mobtool");
// Strategies
require("./googleauth/googlestrategy");
require("./githubauth/githubStrategy");
require("./facebookauth/facebookStrategy");

// Import express
const express = require("express");


// Initialize express app
const app = express();

// CORS configuration with proper cookie handling
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://store-iq-client.vercel.app"
    ],
    credentials: true,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "Set-Cookie"
    ],
    exposedHeaders: ["Set-Cookie"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  })
);

// Import all routes
const routes = require("./routes");
const googleRoutes = require("../src/googleauth/googleroutes");
const githubRoutes = require("../src/githubauth/githubroutes");
const facebookRoutes = require("../src/facebookauth/facebookroutes");

const verifyJWT = require("../src/routes/authMiddleware"); // your JWT verifier

// Publish routes
const publishRoutes = require("./routes/publish");

// Define a port
const PORT = process.env.PORT || 5000;

// Middleware
// Parse JSON bodies and cookies with increased size limit for image uploads
// Skip body parsing for file upload routes - let multer handle them
app.use((req, res, next) => {
  // Skip body parsing for file upload endpoints
  if (req.path === '/api/ai/edit-image') {
    return next();
  }

  // Check content type as backup
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }

  // Apply JSON and urlencoded parsers for other requests
  express.json({ limit: '50mb' })(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ limit: '50mb', extended: true })(req, res, next);
  });
});
app.use(cookieParser());

// Set security headers
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Set-Cookie'
  });
  next();
});
app.use(passport.initialize()); // no sessions

// Mount routes
app.use("/api/ai", aiRoutes);
app.use("/api", routes);
app.use("/auth", googleRoutes);
app.use("/auth", githubRoutes);
app.use("/auth", facebookRoutes);
app.use("/api/publish", publishRoutes);
app.use("/video-tts", videoTTSRoutes);
app.use('/youtube', youtubeRoutes);
app.use("/api/schedule", scheduleRoutes); // Register schedule routes
app.use("/api/video", videoMountingRoutes);
app.use("/api", uploadAudioRoutes);
app.use("/api", instagramRoutes);

// Add error handling middleware
app.use((err, req, res, next) => {
  // Enhanced error logging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    status: err.status,
    name: err.name,
    path: req.path,
    method: req.method,
    userId: req?.user?._id
  });

  // Handle specific error types
  if (err.name === 'UnauthorizedError' || err.message?.toLowerCase().includes('unauthorized')) {
    return res.status(401).json({
      error: 'Authentication required',
      requiresReauth: true,
      details: err.message
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Session expired',
      requiresReauth: true
    });
  }

  // YouTube specific errors
  if (err.message?.includes('YouTube') || err.code === 'YOUTUBE_ERROR') {
    const status = err.message.includes('not linked') ? 401 : 400;
    return res.status(status).json({
      error: err.message,
      service: 'youtube',
      requiresReauth: status === 401
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: Object.values(err.errors).map(e => e.message)
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code,
    timestamp: new Date().toISOString()
  });
});


app.use("/api", aimobRoutes);
app.use("/api", geminiRoutes);
// Basic route
app.get("/", (req, res) => {
  res.send("Backend server is running 🚀");
});

// Protected route with JWT
app.get("/dashboard", verifyJWT, (req, res) => {
  res.send(`Hello, ${req.user.username}`);
});

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    
    // Initialize scheduling service
    const schedulingService = require('./services/schedulingService');
    schedulingService.ensureProcessingJob();
    console.log("Scheduling service initialized");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
 