const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/sendgrid-webhook', async (req, res) => {
  const { from, to, text } = req.body;
  try {
    await db.query(
      'INSERT INTO communications (user_id, broker_id, type, virtual_email, status, message) VALUES ($1, $2, $3, $4, $5, $6)',
      [null, null, 'email', to, 'delivered', text]
    );
    res.status(200).send('Webhook received');
  } catch (err) {
    console.error('SendGrid webhook error:', err.stack);
    res.status(500).send('Server error');
  }
});

module.exports = router;