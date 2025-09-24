// server/src/routes/scriptHistory.js
const express = require('express');
const router = express.Router();
const {
  saveScriptHistory,
  getScriptHistory,
  deleteScriptHistoryById,
  deleteScriptHistoryByUser
} = require('../controllers/scriptHistoryController');

router.post('/history', saveScriptHistory);
router.get('/history', getScriptHistory);

// Delete a single script history item by ID
router.delete('/history/:id', deleteScriptHistoryById);

// Delete all script history items for a user
router.delete('/history', deleteScriptHistoryByUser);

module.exports = router;