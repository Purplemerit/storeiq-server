const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  s3Key: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String },
  description: { type: String },
  publishCount: { type: Number, default: 0 },
  publishedToYouTube: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', VideoSchema);