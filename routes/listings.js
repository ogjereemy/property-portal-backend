const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/listings
router.get('/listings', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM listings');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching listings:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/listings/:id
router.get('/listings/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(id)) {
    return res.status(400).json({ message: 'Valid listing ID is required' });
  }
  try {
    const result = await db.query('SELECT * FROM listings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching listing:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;