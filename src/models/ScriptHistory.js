// server/src/models/ScriptHistory.js
const mongoose = require('mongoose');

const ScriptHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  prompt: { type: String, required: true },
  script: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  metadata: { type: Object }
});

module.exports = mongoose.model('ScriptHistory', ScriptHistorySchema);