// server/src/routes/scriptHistory.js
const express = require('express');
const router = express.Router();
const {
  saveScriptHistory,
  getScriptHistory
} = require('../controllers/scriptHistoryController');

router.post('/history', saveScriptHistory);
router.get('/history', getScriptHistory);

module.exports = router;