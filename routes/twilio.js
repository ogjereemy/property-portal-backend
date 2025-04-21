const express = require('express');
const router = express.Router();
const db = require('../db');
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// POST /api/twilio-webhook
router.post('/twilio-webhook', async (req, res) => {
  const { To, From, Body, CallSid, CallStatus, MessageSid, MessageStatus } = req.body;
  console.log('Twilio webhook received:', req.body);

  try {
    if (CallSid && CallStatus) {
      // Handle call status updates
      const communication = await db.query(
        'UPDATE communications SET status = $1 WHERE virtual_number = $2 AND type = $3 RETURNING *',
        [CallStatus, To, 'call']
      );
      console.log('Call status updated:', communication.rows[0]);
    } else if (MessageSid && MessageStatus) {
      // Handle WhatsApp/SMS status updates
      const communication = await db.query(
        'UPDATE communications SET status = $1 WHERE virtual_number = $2 AND type = $3 RETURNING *',
        [MessageStatus, To, 'whatsapp']
      );
      console.log('Message status updated:', communication.rows[0]);
    } else if (Body && From && To) {
      // Handle incoming WhatsApp message
      const user = await db.query('SELECT * FROM users WHERE phone = $1', [From.replace('whatsapp:', '')]);
      if (user.rows.length === 0) {
        console.error('User not found for phone:', From);
        return res.status(404).send('User not found');
      }

      const communication = await db.query(
        'INSERT INTO communications (user_id, listing_id, type, status, virtual_number, user_email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [user.rows[0].id, null, 'whatsapp', 'received', To, user.rows[0].email]
      );
      console.log('Incoming message recorded:', communication.rows[0]);

      // Respond with TwiML
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message('Thank you for your message! We will respond soon.');
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }

    res.status(200).send('Webhook processed');
  } catch (err) {
    console.error('Webhook error:', err.stack);
    res.status(500).send('Server error');
  }
});

module.exports = router;