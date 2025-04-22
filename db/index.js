const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

const retryQuery = async (text, params, retries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Query attempt ${attempt}:`, text, params);
      const result = await pool.query(text, params);
      return result;
    } catch (err) {
      console.error(`Query attempt ${attempt} failed:`, err.stack);
      if (attempt === retries) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

module.exports.query = async (text, params) => {
  if (text.includes('listings') && params?.includes(undefined)) {
    console.error('Undefined parameter in listings query:', new Error().stack);
  }
  return retryQuery(text, params);
};