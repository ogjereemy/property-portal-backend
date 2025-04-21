require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 10000
});

pool.on('connect', () => console.log('Database connected'));
pool.on('error', (err) => console.error('Database error:', err.stack));

module.exports = {
  query: async (text, params) => {
    console.log('Executing query:', text, params);
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error('Query error:', err.stack);
      throw err;
    }
  }
};