const mongoose = require('mongoose');

const scheduledPostSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  videoS3Key: { type: String, required: true },
  scheduledTime: { type: Date, required: true },
  userTimezone: { type: String, required: true },
  platform: { type: String, enum: ['youtube'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  error: String
}, { timestamps: true });

const ScheduledPost = mongoose.model('ScheduledPost', scheduledPostSchema);

module.exports = ScheduledPost;