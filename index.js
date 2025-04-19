const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:3001',
  'https://property-portal-web.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Initialize database pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.stack);
    return;
  }
  console.log('Database connected successfully');
  release();
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

app.post('/api/register', async (req, res) => {
  const { email, password, role } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role, verified',
      [email, hashedPassword, role || 'customer']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    console.log('Login attempt:', { email });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      console.log('User not found:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const user = result.rows[0];
    console.log('User found:', { id: user.id, email: user.email });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password mismatch for:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, verified: user.verified }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });
    console.log('Login successful:', { email, token });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, verified: user.verified } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, role, verified FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ message: 'Failed to fetch user', error: error.message });
  }
});

app.post('/api/verify-agent/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'agent') {
    return res.status(403).json({ message: 'Agents only' });
  }
  const { id } = req.params;
  try {
    const result = await pool.query('UPDATE users SET verified = TRUE WHERE id = $1 AND role = $2 RETURNING *', [id, 'agent']);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Verify agent error:', error);
    res.status(500).json({ message: 'Failed to verify agent', error: error.message });
  }
});

app.get('/api/listings', authenticateToken, async (req, res) => {
  try {
    const { price_max, location } = req.query;
    let query = 'SELECT * FROM listings';
    const values = [];
    const conditions = [];
    if (price_max) {
      conditions.push(`price <= $${conditions.length + 1}`);
      values.push(price_max);
    }
    if (location) {
      conditions.push(`location ILIKE $${conditions.length + 1}`);
      values.push(`%${location}%`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch listings error:', error);
    res.status(500).json({ message: 'Failed to fetch listings', error: error.message });
  }
});

app.post('/api/listings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'agent' || !req.user.verified) {
    return res.status(403).json({ message: 'Verified agents only' });
  }
  const { title, price, location, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO listings (title, price, location, description, agent_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, price, location, description || '', req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create listing error:', error);
    res.status(500).json({ message: 'Failed to create listing', error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});