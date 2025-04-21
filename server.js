require('dotenv').config();
const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/user');
const communicationsRoutes = require('./routes/communications');
const listingsRoutes = require('./routes/listings');
const twilioRoutes = require('./routes/twilio');
const sendgridRoutes = require('./routes/sendgrid');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', userRoutes);
app.use('/api', communicationsRoutes);
app.use('/api', listingsRoutes);
app.use('/api', twilioRoutes);
app.use('/api', sendgridRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));