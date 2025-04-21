CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  phone VARCHAR(20)
);

CREATE TABLE listings (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  price INTEGER NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT,
  agent_id INTEGER REFERENCES users(id)
);

CREATE TABLE communications (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id),
  user_id INTEGER REFERENCES users(id),
  broker_id INTEGER REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  virtual_number VARCHAR(20),
  virtual_email VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);