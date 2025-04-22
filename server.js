const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const listingsRouter = require('./routes/listings');
const communicationsRouter = require('./routes/communications');
const twilioRouter = require('./routes/twilio');
const authRouter = require('./routes/auth');

const app = express();

// CORS configuration
const allowedOrigins = ['http://localhost:3000', 'https://property-portal-web.vercel.app'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/listings', listingsRouter);
app.use('/api/communications', communicationsRouter);
app.use('/api/twilio-webhook', twilioRouter);
app.use('/api/auth', authRouter); // Ensure /api/auth maps to auth.js

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});