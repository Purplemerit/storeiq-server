const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
  username: { type: String, required: false }, // optional for OAuth
  email: { type: String, unique: true, sparse: true },
  avatar: String,

  // Local auth fields
  password: { type: String }, // bcrypt hash (only required for local auth)
 

  // OAuth provider IDs
  googleId: { type: String, unique: true, sparse: true },
  githubId: { type: String, unique: true, sparse: true },
  facebookId: { type: String, unique: true, sparse: true },

  // Encrypted OAuth tokens for YouTube (Google) and Instagram (Facebook)
  googleAccessToken: { type: String, select: false }, // Excluded from queries by default
  googleRefreshToken: { type: String, select: false },
  facebookAccessToken: { type: String, select: false },
  facebookRefreshToken: { type: String, select: false },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  timezone: { type: String, default: 'UTC' },
}, {
  toJSON: {
    transform: function(doc, ret) {
      delete ret.googleAccessToken;
      delete ret.googleRefreshToken;
      delete ret.facebookAccessToken;
      delete ret.facebookRefreshToken;
      return ret;
    }
  }
});

// Method to safely fetch tokens
userSchema.statics.getTokensById = async function(userId) {
  return this.findById(userId)
    .select('+googleAccessToken +googleRefreshToken +facebookAccessToken +facebookRefreshToken')
    .exec();
};


// Automatically update `updatedAt` on save
userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("User", userSchema);
