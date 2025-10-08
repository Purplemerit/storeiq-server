const ScheduledPost = require('../models/ScheduledPost');
const User = require('../models/User');
const mongoose = require('mongoose');
const publishController = require('../controllers/publishController');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class SchedulingService {
  async validateSchedulingRequest(userId, videoS3Key, scheduledTime) {
    // Validate user exists and has YouTube connection
    const user = await User.findById(userId).select('+googleAccessToken +_id');
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
      console.log("Processing scheduled posts...");
      const now = new Date();
      // Find posts to process and include user data
      const postsToProcess = await ScheduledPost.find({
        scheduledTime: { $lte: now },
        status: 'pending'
      }).populate('userId', '_id googleAccessToken').limit(10);

      console.log(`Found ${postsToProcess.length} posts to process`);

      for (const post of postsToProcess) {
        try {
          console.log(`Processing post ${post._id}`);
          
          if (!post.userId || !post.userId.googleAccessToken) {
            console.error(`User ${post.userId?._id} not found or no YouTube connection`);
            await ScheduledPost.findByIdAndUpdate(post._id, {
              status: 'failed',
              error: 'YouTube account not connected'
            });
            continue;
          }

          // Attempt to publish to YouTube
          console.log(`Publishing video ${post.videoS3Key} to YouTube for user ${post.userId._id}...`);
          const videoId = await publishController.publishVideoToYouTube(
            post.userId._id.toString(),
            post.videoS3Key,
            { title: post.title, description: post.description }
          );
          
          await ScheduledPost.findByIdAndUpdate(post._id, {
            status: 'completed',
            publishedVideoId: videoId
          });

          console.log(`Successfully processed scheduled post ${post._id}`);
        } catch (error) {
          console.error(`Error processing post ${post._id}:`, error);
          await ScheduledPost.findByIdAndUpdate(post._id, {
            status: 'failed',
            error: error.message
          });
        }
      }
    } catch (error) {
      console.error('Error processing scheduled posts:', error);
    }
  }

  // Ensure the processing job runs frequently
  ensureProcessingJob() {
    if (!global.schedulingInterval) {
      console.log('Starting scheduling interval...');
      // Initial run
      this.processScheduledPosts().catch(error => {
        console.error('Initial scheduling run error:', error);
      });

      // Set up interval
      global.schedulingInterval = setInterval(() => {
        this.processScheduledPosts().catch(error => {
          console.error('Scheduling interval error:', error);
        });
      }, 30000); // Run every 30 seconds for more frequent checks
    }
  }
}

module.exports = new SchedulingService();