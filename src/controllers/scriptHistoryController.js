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

module.exports = {
  saveScriptHistory,
  getScriptHistory
};