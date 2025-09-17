const mongoose = require("mongoose");

const AuthuserSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true, sparse: true }, 
  avatar: String,

  // OAuth provider IDs
  googleId: { type: String, unique: true, sparse: true },
  githubId: { type: String, unique: true, sparse: true },
  facebookId: { type: String, unique: true, sparse: true },

  // Optional extra info
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AuthUser", AuthuserSchema);
