const express = require('express');
const bodyParser = require('body-parser');
const listingsRouter = require('./routes/listings');
const communicationsRouter = require('./routes/communications');
const twilioRouter = require('./routes/twilio');
const authRouter = require('./routes/auth');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Parse Twilio's form-urlencoded payloads

// Routes
app.use('/api/listings', listingsRouter);
app.use('/api/communications', communicationsRouter);
app.use('/api/twilio-webhook', twilioRouter);
app.use('/api/auth', authRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});