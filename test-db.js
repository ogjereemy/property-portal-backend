require('dotenv').config();
const { Client } = require('pg');

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000
});

async function testConnection() {
  try {
    await client.connect();
    console.log('Client connected');
    const res = await client.query('SELECT 1');
    console.log('Query result:', res.rows);
    console.log('Database connected');
  } catch (err) {
    console.error('Connection error:', err.stack);
  } finally {
    await client.end();
    console.log('Client closed');
  }
}

testConnection();