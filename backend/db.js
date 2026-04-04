const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDB = async () => {
  try {
    await pool.query(`

      -- USERS
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(100) NOT NULL,
        email        VARCHAR(255) UNIQUE NOT NULL,
        password     VARCHAR(255) NOT NULL,
        is_active    BOOLEAN DEFAULT true,
        phone        VARCHAR(20),
        phone_verified BOOLEAN DEFAULT false,
        demo_kyc_verified BOOLEAN DEFAULT false,
        aadhaar_name VARCHAR(100),
        aadhaar_masked VARCHAR(20),
        bio          TEXT,
        country      VARCHAR(60),
        currency     VARCHAR(10) DEFAULT 'USD',
        avatar_url   TEXT,
        created_at   TIMESTAMP DEFAULT NOW(),
        updated_at   TIMESTAMP DEFAULT NOW()
      );

      -- PASSWORD RESETS
      CREATE TABLE IF NOT EXISTS password_resets (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token      VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- WALLETS
      CREATE TABLE IF NOT EXISTS wallets (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance    NUMERIC(18,8) DEFAULT 10000.00,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- HOLDINGS
      CREATE TABLE IF NOT EXISTS holdings (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        coin_id    VARCHAR(100) NOT NULL,
        coin_name  VARCHAR(100),
        symbol     VARCHAR(20),
        amount     NUMERIC(18,8) NOT NULL DEFAULT 0,
        buy_price  NUMERIC(18,8) NOT NULL DEFAULT 0,
        icon       VARCHAR(10),
        icon_color VARCHAR(30),
        icon_bg    VARCHAR(60),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, coin_id)
      );

      -- TRANSACTIONS
      CREATE TABLE IF NOT EXISTS transactions (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type       VARCHAR(20) NOT NULL CHECK (type IN ('buy','sell','deposit','withdraw')),
        coin_id    VARCHAR(100),
        coin_name  VARCHAR(100),
        symbol     VARCHAR(20),
        amount     NUMERIC(18,8),
        price      NUMERIC(18,8),
        total      NUMERIC(18,8),
        note       TEXT,
        status     VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ALERTS
      CREATE TABLE IF NOT EXISTS alerts (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
        coin_id      VARCHAR(100) NOT NULL,
        coin_name    VARCHAR(100),
        symbol       VARCHAR(20),
        condition    VARCHAR(10) NOT NULL CHECK (condition IN ('above','below')),
        target_price NUMERIC(18,8) NOT NULL,
        status       VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting','triggered','inactive')),
        note         TEXT,
        created_at   TIMESTAMP DEFAULT NOW()
      );

      -- WATCHLIST
      CREATE TABLE IF NOT EXISTS watchlist (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        coin_id    VARCHAR(50) NOT NULL,
        symbol     VARCHAR(20) NOT NULL,
        name       VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, coin_id)
      );

      -- BANK ACCOUNTS
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
        bank_name      VARCHAR(100) NOT NULL,
        account_number VARCHAR(30) NOT NULL,
        masked_number  VARCHAR(20),
        ifsc           VARCHAR(20),
        account_type   VARCHAR(20) DEFAULT 'savings',
        created_at     TIMESTAMP DEFAULT NOW()
      );

      -- EXCHANGE CONNECTIONS (used by exchange.js)
      CREATE TABLE IF NOT EXISTS exchange_connections (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        exchange   VARCHAR(50) NOT NULL,
        api_key    TEXT NOT NULL,
        api_secret TEXT NOT NULL,
        passphrase TEXT,
        is_active  BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, exchange)
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_kyc_verified BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_name VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_masked VARCHAR(20);

    `);
    console.log('✅ All database tables ready');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
};

initDB();

module.exports = pool;
