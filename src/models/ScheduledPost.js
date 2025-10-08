const mongoose = require('mongoose');

const scheduledPostSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  videoS3Key: { 
    type: String, 
    required: true 
  },
  scheduledTime: { 
    type: Date, 
    required: true 
  },
  userTimezone: { 
    type: String, 
    required: true 
  },
  platform: { 
    type: String, 
    enum: ['youtube'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed'], 
    default: 'pending' 
  },
  error: String,
  publishedVideoId: String
}, { 
  timestamps: true 
});

// Index to help with querying pending posts by scheduled time
scheduledPostSchema.index({ status: 1, scheduledTime: 1 });

// Index to help with querying user's posts
scheduledPostSchema.index({ userId: 1, scheduledTime: -1 });

const ScheduledPost = mongoose.model('ScheduledPost', scheduledPostSchema);

module.exports = ScheduledPost;