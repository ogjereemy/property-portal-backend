const express = require('express');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const db = require('../db');

const router = express.Router();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

router.post('/communications', authenticate, async (req, res) => {
  const { type, listingId, userEmail } = req.body;
  try {
    const listingResult = await db.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    const listing = listingResult.rows[0];
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const agentResult = await db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [listing.agent_id, 'agent']);
    const agent = agentResult.rows[0];
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    let virtualNumber = null;
    let virtualEmail = null;
    let communicationId;

    if (type === 'call' || type === 'whatsapp') {
      virtualNumber = process.env.TWILIO_PHONE_NUMBER;
      const insertResult = await db.query(
        'INSERT INTO communications (listing_id, user_id, broker_id, type, virtual_number, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [listingId, req.user.id, agent.id, type, virtualNumber, 'delivered']
      );
      communicationId = insertResult.rows[0].id;

      await client.messages.create({
        body: `New ${type} request for listing: ${listing.title} from ${userEmail}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: agent.phone
      });
    } else if (type === 'email') {
      virtualEmail = `agent-${listingId}@propertyportal.com`;
      const insertResult = await db.query(
        'INSERT INTO communications (listing_id, user_id, broker_id, type, virtual_email, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [listingId, req.user.id, agent.id, type, virtualEmail, 'delivered']
      );
      communicationId = insertResult.rows[0].id;

      await sgMail.send({
        to: agent.email,
        from: 'noreply@propertyportal.com',
        replyTo: virtualEmail,
        subject: `New inquiry for ${listing.title}`,
        text: `User ${userEmail} is interested in your listing: ${listing.title}.`
      });
    } else {
      return res.status(400).json({ message: 'Invalid communication type' });
    }

    res.json({ virtualNumber, virtualEmail, communicationId });
  } catch (err) {
    console.error('Communication error:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/communications/email', authenticate, async (req, res) => {
  const { listingId, name, email, message } = req.body;
  try {
    const listingResult = await db.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    const listing = listingResult.rows[0];
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const agentResult = await db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [listing.agent_id, 'agent']);
    const agent = agentResult.rows[0];
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const virtualEmail = `agent-${listingId}@propertyportal.com`;
    await db.query(
      'INSERT INTO communications (listing_id, user_id, broker_id, type, virtual_email, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [listingId, req.user.id, agent.id, 'email', virtualEmail, 'delivered']
    );

    await sgMail.send({
      to: agent.email,
      from: 'noreply@propertyportal.com',
      replyTo: virtualEmail,
      subject: `New inquiry for ${listing.title}`,
      text: `From: ${name} (${email})\nMessage: ${message}\nListing: ${listing.title}`
    });

    res.status(201).json({ message: 'Email sent' });
  } catch (err) {
    console.error('Email error:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;