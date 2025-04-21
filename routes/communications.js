const express = require('express');
const router = express.Router();
const db = require('../db');
const twilio = require('twilio');
const sendgridMail = require('@sendgrid/mail');
const jwt = require('jsonwebtoken');

sendgridMail.setApiKey(process.env.SENDGRID_API_KEY);
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// POST /api/communications
router.post('/communications', authenticateToken, async (req, res) => {
  const { type, listingId, userEmail } = req.body;

  if (!type || !listingId) {
    return res.status(400).json({ message: 'Type and listingId are required' });
  }

  if (!['call', 'whatsapp', 'email'].includes(type)) {
    return res.status(400).json({ message: 'Invalid communication type' });
  }

  try {
    const listing = await db.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    if (listing.rows.length === 0) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const agent = await db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [listing.rows[0].agent_id, 'agent']);
    if (agent.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const effectiveEmail = userEmail || req.user.email; // Fallback to req.user.email
    const communication = await db.query(
      'INSERT INTO communications (user_id, listing_id, type, status, virtual_number, user_email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.id, listingId, type, 'initiated', process.env.TWILIO_PHONE_NUMBER, effectiveEmail]
    );

    if (type === 'call') {
      await client.calls.create({
        url: `https://property-portal-backend-u31h.onrender.com/api/twilio-webhook`,
        to: agent.rows[0].phone,
        from: process.env.TWILIO_PHONE_NUMBER,
        statusCallback: `https://property-portal-backend-u31h.onrender.com/api/twilio-webhook`,
        statusCallbackEvent: ['initiated', 'answered', 'completed']
      });
    } else if (type === 'whatsapp') {
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${agent.rows[0].phone}`,
        body: `Interest in listing ${listing.rows[0].title} from ${effectiveEmail}`
      });
    } else if (type === 'email') {
      const msg = {
        to: agent.rows[0].email,
        from: 'no-reply@propertyportal.com',
        subject: `New Inquiry for ${listing.rows[0].title}`,
        text: `User ${effectiveEmail} is interested in listing ${listing.rows[0].title}.`,
        html: `<p>User ${effectiveEmail} is interested in listing <strong>${listing.rows[0].title}</strong>.</p>`
      };
      await sendgridMail.send(msg);
    }

    res.json({
      virtualNumber: process.env.TWILIO_PHONE_NUMBER,
      communicationId: communication.rows[0].id
    });
  } catch (err) {
    console.error('Communication error:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/communications/email
router.post('/communications/email', authenticateToken, async (req, res) => {
  const { listingId, name, email, message } = req.body;

  if (!listingId || !name || !email || !message) {
    return res.status(400).json({ message: 'Listing ID, name, email, and message are required' });
  }

  try {
    const listing = await db.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    if (listing.rows.length === 0) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const agent = await db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [listing.rows[0].agent_id, 'agent']);
    if (agent.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const msg = {
      to: agent.rows[0].email,
      from: 'no-reply@propertyportal.com',
      subject: `New Inquiry for ${listing.rows[0].title}`,
      text: `From: ${name} (${email})\nMessage: ${message}`,
      html: `<p>From: ${name} (${email})</p><p>Message: ${message}</p>`
    };
    await sendgridMail.send(msg);

    const communication = await db.query(
      'INSERT INTO communications (user_id, listing_id, type, status, user_email) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, listingId, 'email', 'sent', email]
    );

    res.json({ message: 'Email sent', communicationId: communication.rows[0].id });
  } catch (err) {
    console.error('Email error:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;