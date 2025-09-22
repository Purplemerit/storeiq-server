const mongoose = require("mongoose");

const mongooseEncryption = require("mongoose-encryption");

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
  googleAccessToken: { type: String },
  googleRefreshToken: { type: String },
  facebookAccessToken: { type: String },
  facebookRefreshToken: { type: String },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  timezone: { type: String, default: 'UTC' },
});

// Encrypt only token fields
const encKey = process.env.USER_ENCRYPTION_KEY;
const sigKey = process.env.USER_SIGNING_KEY;
if (encKey && sigKey) {
  userSchema.plugin(mongooseEncryption, {
    encryptionKey: Buffer.from(encKey, 'base64'),
    signingKey: Buffer.from(sigKey, 'base64'),
    encryptedFields: [
      "googleAccessToken",
      "googleRefreshToken",
      "facebookAccessToken",
      "facebookRefreshToken"
    ],
     requireAuthenticationCode: false
  });
}

// Automatically update `updatedAt` on save
userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("User", userSchema);
