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
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    console.log('Request origin:', origin);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('CORS error: Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());
app.options('*', cors()); // Preflight response for all routes

// Validate environment variables
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing environment variables:', missingEnvVars);
  process.exit(1);
}

// Initialize database pool with SSL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.message, err.stack);
    process.exit(1);
  }
  console.log('Database connected successfully');
  release();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'OK', database: 'connected' });
  } catch (error) {
    console.error('Health check error:', error.message, error.stack);
    res.status(500).json({ status: 'ERROR', database: 'disconnected', error: error.message });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token', error: err.message });
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
    console.log('Register attempt:', { email, role });
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');
    const result = await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role, verified',
      [email, hashedPassword, role || 'customer']
    );
    console.log('User registered:', { id: result.rows[0].id, email });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Register error:', error.message, error.stack);
    res.status(500).json({ message: 'Registration failed', error: error.message || 'Unknown error' });
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
    const token = jwt.sign({ id: user.id, role: user.role, verified: user.verified }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });
    console.log('Login successful:', { email, token });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, verified: user.verified } });
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    res.status(500).json({ message: 'Login failed', error: error.message || 'Unknown error' });
  }
});

app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    console.log('Fetch user:', { userId: req.user.id });
    const result = await pool.query('SELECT id, email, role, verified FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Fetch user error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to fetch user', error: error.message || 'Unknown error' });
  }
});

app.post('/api/verify-agent/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'agent') {
    return res.status(403).json({ message: 'Agents only' });
  }
  const { id } = req.params;
  try {
    console.log('Verify agent attempt:', { agentId: id });
    const result = await pool.query('UPDATE users SET verified = TRUE WHERE id = $1 AND role = $2 RETURNING *', [id, 'agent']);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    console.log('Agent verified:', { id });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Verify agent error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to verify agent', error: error.message || 'Unknown error' });
  }
});

app.get('/api/listings', authenticateToken, async (req, res) => {
  try {
    const { price_max, location } = req.query;
    console.log('Fetch listings:', { price_max, location });
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
    console.error('Fetch listings error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to fetch listings', error: error.message || 'Unknown error' });
  }
});

app.post('/api/listings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'agent' || !req.user.verified) {
    return res.status(403).json({ message: 'Verified agents only' });
  }
  const { title, price, location, description } = req.body;
  try {
    console.log('Create listing attempt:', { title, price, location });
    const result = await pool.query(
      'INSERT INTO listings (title, price, location, description, agent_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, price, location, description || '', req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create listing error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to create listing', error: error.message || 'Unknown error' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});