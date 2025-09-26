// MongoJobStore implementation using mongoose and the videoEditJobs collection

const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  videoUrl: { type: String },
  s3Key: { type: String },
  start: { type: Number },
  end: { type: Number },
  userId: { type: String },
  username: { type: String },
  status: { type: String, default: 'pending' },
  error: { type: String, default: null },
  downloadUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'videoEditJobs' });

const JobModel = mongoose.models.VideoEditJob || mongoose.model('VideoEditJob', JobSchema);

class MongoJobStore {
  async createJob(job) {
    const jobId = Math.random().toString(36).slice(2, 12);
    const now = new Date();
    const newJob = {
      ...job,
      jobId,
      status: 'pending',
      error: null,
      downloadUrl: null,
      createdAt: now,
      updatedAt: now
    };
    const doc = await JobModel.create(newJob);
    return doc.toObject();
  }

  async updateJob(jobId, updates) {
    const updated = await JobModel.findOneAndUpdate(
      { jobId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) {
      console.warn(`[JobStore][WARN] No document updated for jobId: ${jobId}. Updates:`, updates);
    }
    return updated ? updated.toObject() : null;
  }

  async getJob(jobId) {
    const job = await JobModel.findOne({ jobId });
    return job ? job.toObject() : null;
  }

  async getAllJobs() {
    const jobs = await JobModel.find({});
    return jobs.map(j => j.toObject());
  }

  async getPendingJobs(type) {
    const query = { status: 'pending' };
    if (type) query.type = type;
    const jobs = await JobModel.find(query);
    return jobs.map(j => j.toObject());
  }
  async deleteJobByS3Key(s3Key) {
    if (!s3Key) return null;
    const result = await JobModel.deleteOne({ s3Key });
    return result.deletedCount;
  }
}

const jobStore = new MongoJobStore();

module.exports = {
  createJob: jobStore.createJob.bind(jobStore),
  updateJob: jobStore.updateJob.bind(jobStore),
  getJob: jobStore.getJob.bind(jobStore),
  getAllJobs: jobStore.getAllJobs.bind(jobStore),
  getPendingJobs: jobStore.getPendingJobs.bind(jobStore),
  deleteJobByS3Key: jobStore.deleteJobByS3Key.bind(jobStore)
};