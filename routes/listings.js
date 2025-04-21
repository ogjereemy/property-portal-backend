const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/listings', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM listings');
    res.json(result.rows);
  } catch (err) {
    console.error('Listings error:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;