const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('Login request:', { email });

  if (!email || !password) {
    console.error('Missing email or password');
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      console.error('User not found:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.error('Invalid password for:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        verified: user.verified
      }
    });
  } catch (err) {
    console.error('Login error:', err.stack);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, role } = req.body;

  console.log('Register request:', { email, role });

  if (!email || !password || !role) {
    console.error('Missing email, password, or role');
    return res.status(400).json({ message: 'Email, password, and role are required' });
  }

  if (!['customer', 'agent'].includes(role)) {
    console.error('Invalid role:', role);
    return res.status(400).json({ message: 'Role must be customer or agent' });
  }

  try {
    // Check if email exists
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      console.error('Email already registered:', email);
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user
    const verified = role === 'customer' ? true : false; // Agents need verification
    const userResult = await db.query(
      'INSERT INTO users (email, password, role, verified) VALUES ($1, $2, $3, $4) RETURNING id, email, role, verified',
      [email, hashedPassword, role, verified]
    );

    const user = userResult.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        verified: user.verified
      }
    });
  } catch (err) {
    console.error('Register error:', err.stack);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

module.exports = router;