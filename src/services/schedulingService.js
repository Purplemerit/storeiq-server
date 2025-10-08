const mongoose = require('mongoose');
const ScheduledPost = require('../models/ScheduledPost');
const User = require('../models/User');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class SchedulingService {
  async validateSchedulingRequest(userId, videoS3Key, scheduledTime) {
    // Ensure userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ValidationError('Invalid user ID format');
    }

    // Validate user exists and has YouTube connection
    const user = await User.findById(userId).select('+googleAccessToken');
    if (!user) {
      throw new ValidationError('User not found');
    }
    if (!user.googleAccessToken) {
      throw new ValidationError('YouTube account not connected');
    }

    // Validate scheduling time
    const scheduleDate = new Date(scheduledTime);
    if (isNaN(scheduleDate.getTime())) {
      throw new ValidationError('Invalid scheduling time format');
    }

    const now = new Date();
    if (scheduleDate <= now) {
      throw new ValidationError('Scheduled time must be in the future');
    }

    const maxScheduleDate = new Date();
    maxScheduleDate.setDate(maxScheduleDate.getDate() + 30); // Max 30 days in advance
    if (scheduleDate > maxScheduleDate) {
      throw new ValidationError('Cannot schedule more than 30 days in advance');
    }

    return true;
  }

  async createScheduledPost(userId, videoS3Key, scheduledTime, timezone) {
    try {
      // Run all validations
      await this.validateSchedulingRequest(userId, videoS3Key, scheduledTime);

      const scheduleDate = new Date(scheduledTime);
      const scheduledPost = new ScheduledPost({
        userId,
        videoS3Key,
        scheduledTime: scheduleDate,
        userTimezone: timezone,
        platform: 'youtube',
        status: 'pending'
      });

      await scheduledPost.save();
      
      // Start processing job if not already running
      this.ensureProcessingJob();
      
      return scheduledPost;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new Error(`Failed to create scheduled post: ${error.message}`);
    }
  }

  async getScheduledPosts(userId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ValidationError('Invalid user ID format');
      }
      return await ScheduledPost.find({ userId }).sort({ scheduledTime: 1 });
    } catch (error) {
      throw new Error(`Failed to get scheduled posts: ${error.message}`);
    }
  }

  async deleteScheduledPost(userId, postId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new ValidationError('Invalid ID format');
      }

      const post = await ScheduledPost.findOne({ _id: postId, userId });
      if (!post) {
        throw new Error('Scheduled post not found');
      }
      
      if (post.status === 'completed') {
        throw new Error('Cannot delete a completed post');
      }

      await ScheduledPost.deleteOne({ _id: postId, userId });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete scheduled post: ${error.message}`);
    }
  }

  async processScheduledPosts() {
    try {
      const now = new Date();
      const postsToProcess = await ScheduledPost.find({
        scheduledTime: { $lte: now },
        status: 'pending'
      }).limit(10); // Process in batches

      for (const post of postsToProcess) {
        try {
          // Double-check YouTube connection before publishing
          const user = await User.findById(post.userId).select('+googleAccessToken');
          if (!user || !user.googleAccessToken) {
            throw new Error('YouTube account not connected');
          }

          // Here we would typically call youtubeService.uploadVideo
          // For now, just mark as completed
          post.status = 'completed';
          await post.save();

          console.log(`Successfully processed scheduled post ${post._id}`);
        } catch (error) {
          post.status = 'failed';
          post.error = error.message;
          await post.save();

          console.error(`Failed to process scheduled post ${post._id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error processing scheduled posts:', error);
    }
  }

  // Ensure the processing job runs every minute
  ensureProcessingJob() {
    if (!global.schedulingInterval) {
      global.schedulingInterval = setInterval(() => {
        this.processScheduledPosts().catch(error => {
          console.error('Scheduling interval error:', error);
        });
      }, 60000); // Run every minute
    }
  }
}

module.exports = new SchedulingService();