/**
 * Meta Webhook Controller
 * Handles Facebook/Instagram webhook verification and events
 */

/**
 * Verify webhook endpoint (GET request)
 * Meta sends this to verify the webhook URL during setup
 */
const verifyWebhook = (req, res) => {
  try {
    // Parse query parameters from Meta's verification request
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Meta Webhook Verification Request:', {
      mode,
      token: token ? '***' : 'missing',
      challenge: challenge ? 'present' : 'missing'
    });

    // Check if mode and token are present
    if (!mode || !token) {
      console.error('Missing mode or token in verification request');
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'hub.mode and hub.verify_token are required'
      });
    }

    // Check if mode is 'subscribe'
    if (mode !== 'subscribe') {
      console.error('Invalid mode:', mode);
      return res.status(403).json({
        error: 'Invalid mode',
        message: 'hub.mode must be "subscribe"'
      });
    }

    // Verify the token matches your verify token
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

    if (!VERIFY_TOKEN) {
      console.error('META_VERIFY_TOKEN not configured in environment variables');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Webhook verify token not configured'
      });
    }

    if (token !== VERIFY_TOKEN) {
      console.error('Token mismatch - verification failed');
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid verify token'
      });
    }

    // Verification successful - respond with the challenge
    console.log('✓ Webhook verification successful');
    return res.status(200).send(challenge);

  } catch (error) {
    console.error('Error in webhook verification:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * Handle webhook events (POST request)
 * This will receive actual webhook events from Meta after verification
 */
const handleWebhookEvent = (req, res) => {
  try {
    const body = req.body;

    console.log('Meta Webhook Event Received:', JSON.stringify(body, null, 2));

    // Verify this is a page subscription
    if (body.object === 'page') {
      // Iterate over each entry (may be multiple if batched)
      body.entry?.forEach((entry) => {
        // Get the webhook event
        const webhookEvent = entry.messaging?.[0] || entry.changes?.[0];

        console.log('Processing webhook event:', webhookEvent);

        // TODO: Process the webhook event based on your requirements
        // Examples:
        // - Instagram comments
        // - Instagram mentions
        // - Facebook page events
        // - Messages

      });

      // Return 200 OK to acknowledge receipt
      return res.status(200).send('EVENT_RECEIVED');
    }

    // Handle Instagram-specific events
    if (body.object === 'instagram') {
      body.entry?.forEach((entry) => {
        const changes = entry.changes || [];

        changes.forEach((change) => {
          console.log('Instagram event:', change.field, change.value);

          // TODO: Handle Instagram-specific events
          // - comments
          // - mentions
          // - story_insights
        });
      });

      return res.status(200).send('EVENT_RECEIVED');
    }

    // Unknown event type
    console.warn('Unknown webhook object type:', body.object);
    return res.status(404).send('Unknown event type');

  } catch (error) {
    console.error('Error handling webhook event:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

module.exports = {
  verifyWebhook,
  handleWebhookEvent
};
