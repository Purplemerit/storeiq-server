const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  s3Key: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String },
  description: { type: String },
  prompt: { type: String }, // AI generation prompt (for images and videos)
  provider: { type: String }, // AI provider (e.g., 'gemini-imagen-3', 'gemini-veo-3')
  publishCount: { type: Number, default: 0 },
  publishedToYouTube: { type: Boolean, default: false },
  lastPublishedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', VideoSchema);