const express = require('express');
const router = express.Router();
const db = require('../db');
const twilio = require('twilio');
const jwt = require('jsonwebtoken');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.error('No access token provided');
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Invalid token:', err.message);
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// POST /api/communications
router.post('/communications', authenticateToken, async (req, res) => {
  const { type, listingId, userEmail } = req.body;

  console.log('Request body:', req.body);

  if (!type || !listingId) {
    console.error('Missing type or listingId');
    return res.status(400).json({ message: 'Type and listingId are required' });
  }

  if (!['call', 'whatsapp', 'email'].includes(type)) {
    console.error('Invalid type:', type);
    return res.status(400).json({ message: 'Invalid communication type' });
  }

  try {
    const listingResult = await db.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    console.log('Listing query result:', listingResult.rows);
    if (listingResult.rows.length === 0) {
      console.error('Listing not found for ID:', listingId);
      return res.status(404).json({ message: 'Listing not found' });
    }

    const agentResult = await db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [listingResult.rows[0].agent_id, 'agent']);
    console.log('Agent query result:', agentResult.rows);
    if (agentResult.rows.length === 0) {
      console.error('Agent not found for agent_id:', listingResult.rows[0].agent_id);
      return res.status(404).json({ message: 'Agent not found' });
    }

    const effectiveEmail = userEmail || req.user.email;
    console.log('Effective email:', effectiveEmail);

    const communication = await db.query(
      'INSERT INTO communications (user_id, listing_id, type, status, virtual_number, user_email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.id, listingId, type, 'initiated', type === 'email' ? null : process.env.TWILIO_PHONE_NUMBER, effectiveEmail]
    );
    console.log('Communication inserted:', communication.rows[0]);

    if (type === 'call') {
      try {
        await client.calls.create({
          url: `https://property-portal-backend-u31h.onrender.com/api/twilio-webhook`,
          to: agentResult.rows[0].phone,
          from: process.env.TWILIO_PHONE_NUMBER,
          statusCallback: `https://property-portal-backend-u31h.onrender.com/api/twilio-webhook`,
          statusCallbackEvent: ['initiated', 'answered', 'completed']
        });
        console.log('Twilio call initiated');
      } catch (twilioErr) {
        console.error('Twilio call error:', twilioErr.message);
        throw new Error(`Twilio call failed: ${twilioErr.message}`);
      }
    } else if (type === 'whatsapp') {
      try {
        await client.messages.create({
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${agentResult.rows[0].phone}`,
          body: `Interest in listing ${listingResult.rows[0].title} from ${effectiveEmail}`,
          statusCallback: `https://property-portal-backend-u31h.onrender.com/api/twilio-webhook`
        });
        console.log('Twilio WhatsApp message sent');
      } catch (twilioErr) {
        console.error('Twilio WhatsApp error:', twilioErr.message);
        throw new Error(`Twilio WhatsApp failed: ${twilioErr.message}`);
      }
    } else if (type === 'email') {
      const emailDetails = {
        to: agentResult.rows[0].email,
        from: 'no-reply@propertyportal.com',
        subject: `New Inquiry for ${listingResult.rows[0].title}`,
        text: `User ${effectiveEmail} is interested in listing ${listingResult.rows[0].title}.`,
        html: `<p>User ${effectiveEmail} is interested in listing <strong>${listingResult.rows[0].title}</strong>.</p>`
      };
      console.log('Email communication logged:', emailDetails);
      await db.query('UPDATE communications SET status = $1 WHERE id = $2', ['sent', communication.rows[0].id]);
    }

    res.json({
      virtualNumber: type === 'email' ? null : process.env.TWILIO_PHONE_NUMBER,
      communicationId: communication.rows[0].id
    });
  } catch (err) {
    console.error('Communication error:', err.stack);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// POST /api/communications/email
router.post('/communications/email', authenticateToken, async (req, res) => {
  const { listingId, name, email, message } = req.body;

  console.log('Email request body:', req.body);

  if (!listingId || !name || !email || !message) {
    console.error('Missing required fields for email');
    return res.status(400).json({ message: 'Listing ID, name, email, and message are required' });
  }

  try {
    const listingResult = await db.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    if (listingResult.rows.length === 0) {
      console.error('Listing not found for ID:', listingId);
      return res.status(404).json({ message: 'Listing not found' });
    }

    const agentResult = await db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [listingResult.rows[0].agent_id, 'agent']);
    if (agentResult.rows.length === 0) {
      console.error('Agent not found for agent_id:', listingResult.rows[0].agent_id);
      return res.status(404).json({ message: 'Agent not found' });
    }

    const emailDetails = {
      to: agentResult.rows[0].email,
      from: 'no-reply@propertyportal.com',
      subject: `New Inquiry for ${listingResult.rows[0].title}`,
      text: `From: ${name} (${email})\nMessage: ${message}`,
      html: `<p>From: ${name} (${email})</p><p>Message: ${message}</p>`
    };
    console.log('Email communication logged:', emailDetails);

    const communication = await db.query(
      'INSERT INTO communications (user_id, listing_id, type, status, user_email) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, listingId, 'email', 'sent', email]
    );
    console.log('Communication inserted:', communication.rows[0]);

    res.json({ message: 'Email logged', communicationId: communication.rows[0].id });
  } catch (err) {
    console.error('Email error:', err.stack);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

module.exports = router;