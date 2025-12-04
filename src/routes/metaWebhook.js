/**
 * Meta Webhook Routes
 * Handles Facebook/Instagram webhook verification and events
 */

const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhookEvent } = require('../controllers/metaWebhookController');

/**
 * GET /api/webhook/meta
 * Webhook verification endpoint
 * Meta sends a GET request here to verify your webhook during setup
 */
router.get('/', verifyWebhook);

/**
 * POST /api/webhook/meta
 * Webhook events endpoint
 * Meta sends POST requests here with actual webhook events
 */
router.post('/', handleWebhookEvent);

module.exports = router;
