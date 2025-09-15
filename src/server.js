require('dotenv').config();
const mongoose = require('mongoose');
// Import express
const express = require("express");

// Initialize express app
const app = express();

// Import all routes
const routes = require("./routes");

// Define a port
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(express.json());

// Mount all routes at /api
app.use("/api", routes);

// Basic route
app.get("/", (req, res) => {
  res.send("Backend server is running 🚀");
});

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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
