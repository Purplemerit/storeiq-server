// server/src/controllers/scriptHistoryController.js
const ScriptHistory = require('../models/ScriptHistory');

// POST /api/scripts/history
async function saveScriptHistory(req, res) {
  try {
    const { userId, prompt, script, metadata } = req.body;
    if (!userId || !prompt || !script) {
      return res.status(400).json({ error: 'userId, prompt, and script are required.' });
    }
    const entry = new ScriptHistory({
      userId,
      prompt,
      script,
      metadata
    });
    await entry.save();
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save script history.' });
  }
}

// GET /api/scripts/history?userId=...
async function getScriptHistory(req, res) {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' });
    }
    const history = await ScriptHistory.find({ userId }).sort({ createdAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch script history.' });
  }
}

/**
 * DELETE /api/scripts/history/:id
 * Delete a single script history item by MongoDB _id.
 */
async function deleteScriptHistoryById(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'id is required.' });
    }
    const result = await ScriptHistory.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ error: 'Script history item not found.' });
    }
    res.json({ message: 'Script history item deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete script history item.' });
  }
}

/**
 * DELETE /api/scripts/history?userId=...
 * Delete all script history items for a user.
 */
async function deleteScriptHistoryByUser(req, res) {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' });
    }
    const result = await ScriptHistory.deleteMany({ userId });
    res.json({ message: `Deleted ${result.deletedCount} script history items for user.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete script history for user.' });
  }
}

module.exports = {
  saveScriptHistory,
  getScriptHistory,
  deleteScriptHistoryById,
  deleteScriptHistoryByUser
};