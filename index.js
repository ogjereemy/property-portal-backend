const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

const allowedOrigins = [
  'http://localhost:3001',
  'https://property-portal-web.vercel.app',
  'http://localhost:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      console.log('Request origin:', origin);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error('CORS error: Origin not allowed:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.options('*', cors());

app.use(express.json());

const { DB_USER, DB_HOST, DB_DATABASE, DB_PASSWORD, DB_PORT, JWT_SECRET } = process.env;

const pool = new Pool({
  user: DB_USER,
  host: DB_HOST,
  database: DB_DATABASE,
  password: DB_PASSWORD,
  port: DB_PORT,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log('Database connected successfully'))
  .catch((err) => console.error('Database connection error:', err));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'connected' });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ status: 'ERROR', database: 'disconnected', error: err.message });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role, verified',
      [email, hashedPassword, role || 'customer']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, verified: user.verified } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/verify-agent/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('UPDATE users SET verified = true WHERE id = $1 AND role = $2 RETURNING *', [id, 'agent']);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Verify agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, email, role, verified FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/listings', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const { title, price, location, description } = req.body;
    const result = await pool.query(
      'INSERT INTO listings (title, price, location, description, agent_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, price, location, description, decoded.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create listing error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/listings', async (req, res) => {
  try {
    const { price_max, location } = req.query;
    let query = 'SELECT * FROM listings';
    const values = [];
    if (price_max || location) {
      query += ' WHERE';
      if (price_max) {
        query += ' price <= $1';
        values.push(price_max);
      }
      if (location) {
        query += values.length ? ' AND' : '';
        query += ` location ILIKE $${values.length + 1}`;
        values.push(`%${location}%`);
      }
    }
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Get listings error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));