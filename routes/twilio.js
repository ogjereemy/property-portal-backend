const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/twilio-webhook', async (req, res) => {
  const { CallSid, To, From, CallStatus } = req.body;
  try {
    await db.query(
      'UPDATE communications SET status = $1 WHERE virtual_number = $2 AND status != $1',
      [CallStatus, To]
    );
    res.status(200).send('Webhook received');
  } catch (err) {
    console.error('Twilio webhook error:', err.stack);
    res.status(500).send('Server error');
  }
});

module.exports = router;