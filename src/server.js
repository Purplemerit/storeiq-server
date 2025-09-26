// require("dotenv").config();
// const mongoose = require("mongoose");
// const passport = require("passport");
// const cookieParser = require("cookie-parser");
// const cors = require("cors");
// const aiRoutes = require("../src/aimodel/routes"); 
// const youtubeRoutes = require('./youtube/youtubeRoutes');
// const videoTTSRoutes = require("../src/ai-tools/text-audio");
// const videoMountingRoutes = require("../src/ai-tools/videoMounting");
// const uploadAudioRoutes = require("./ai-tools/uploadAudio");
// const instagramRoutes = require("../src/instagramconnect/instagram");


// const aimobRoutes = require("../src/ai-tools/mobtool");
// // Strategies
// require("./googleauth/googlestrategy");
// require("./githubauth/githubStrategy");
// require("./facebookauth/facebookStrategy");

// // Import express
// const express = require("express");


// // Initialize express app
// const app = express();

// // CORS configuration
// app.use(
//  cors({
//    origin: "http://localhost:5173",
//    credentials: true,
//    allowedHeaders: [
//      "Origin",
//      "X-Requested-With",
//      "Content-Type",
//      "Accept",
//      "Authorization"
//    ],
//  })
// );

// // Import all routes
// const routes = require("./routes");
// const googleRoutes = require("../src/googleauth/googleroutes");
// const githubRoutes = require("../src/githubauth/githubroutes");
// const facebookRoutes = require("../src/facebookauth/facebookroutes");

// const verifyJWT = require("../src/routes/authMiddleware"); // your JWT verifier

// // Publish routes
// const publishRoutes = require("./routes/publish");

// // Define a port
// const PORT = process.env.PORT || 5000;

// // Middleware
// app.use(express.json());
// app.use(cookieParser());
// app.use(
//   cors({
//     origin: process.env.FRONTEND_URL|| "*", // frontend URL, e.g. http://localhost:3000
//     credentials: true, // allow cookies to be sent
//   })
// );
// app.use(passport.initialize()); // no sessions

// // Mount routes
// app.use("/ai", aiRoutes);
// app.use("/api/ai", aiRoutes);
// app.use("/api", routes);
// app.use("/auth", googleRoutes);
// app.use("/auth", githubRoutes);
// app.use("/auth", facebookRoutes);
// app.use("/api/publish", publishRoutes);
// app.use("/video-tts", videoTTSRoutes);
// app.use('/youtube', youtubeRoutes);
// app.use("/api/video", videoMountingRoutes);
// app.use("/api", uploadAudioRoutes);
// app.use("/api", instagramRoutes);


// app.use("/api", aimobRoutes);
// // Basic route
// app.get("/", (req, res) => {
//   res.send("Backend server is running 🚀");
// });

// // Protected route with JWT
// app.get("/dashboard", verifyJWT, (req, res) => {
//   res.send(`Hello, ${req.user.username}`);
// });

// // Connect to MongoDB and start server
// mongoose
//   .connect(process.env.MONGODB_URI)
//   .then(() => {
//     console.log("Connected to MongoDB");
//     // app.listen(PORT, () => {
//     //   console.log(`Server running on http://localhost:${PORT}`);
//     // });
//   })
//   .catch((err) => {
//     console.error("Failed to connect to MongoDB:", err);
//     process.exit(1);
//   });
//   module.exports = app
// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const cors = require("cors");

// Routes
const aiRoutes = require("../src/aimodel/routes"); 
const youtubeRoutes = require('./youtube/youtubeRoutes');
const videoTTSRoutes = require("../src/ai-tools/text-audio");
const videoMountingRoutes = require("../src/ai-tools/videoMounting");
const uploadAudioRoutes = require("./ai-tools/uploadAudio");
const instagramRoutes = require("../src/instagramconnect/instagram");
const aimobRoutes = require("../src/ai-tools/mobtool");
const routes = require("./routes");
const googleRoutes = require("../src/googleauth/googleroutes");
const githubRoutes = require("../src/githubauth/githubroutes");
const facebookRoutes = require("../src/facebookauth/facebookroutes");
const publishRoutes = require("./routes/publish");
const verifyJWT = require("../src/routes/authMiddleware");

// Passport strategies
require("./googleauth/googlestrategy");
require("./githubauth/githubStrategy");
require("./facebookauth/facebookStrategy");

const app = express();

// CORS setup
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"]
}));

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// MongoDB connection helper (serverless-friendly)
let cached = global.mongoose;

if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectToDatabase() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }).then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Routes
app.use("/ai", aiRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api", routes);
app.use("/auth", googleRoutes);
app.use("/auth", githubRoutes);
app.use("/auth", facebookRoutes);
app.use("/api/publish", publishRoutes);
app.use("/video-tts", videoTTSRoutes);
app.use("/youtube", youtubeRoutes);
app.use("/api/video", videoMountingRoutes);
app.use("/api", uploadAudioRoutes);
app.use("/api", instagramRoutes);
app.use("/api", aimobRoutes);

// Basic route
app.get("/", async (req, res) => {
  await connectToDatabase(); // Ensure DB connection before request
  res.send("Backend server is running 🚀");
});

// Protected route
app.get("/dashboard", verifyJWT, async (req, res) => {
  await connectToDatabase();
  res.send(`Hello, ${req.user.username}`);
});

// Export app for Vercel
module.exports = async (req, res) => {
  await connectToDatabase();
  app(req, res);
};
