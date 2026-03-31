const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { protect } = require('../middleware/auth');
const { sendResetEmail } = require('../utils/sendEmail');
const { requireEnv } = require('../config/env');
require('dotenv').config();

// 🔐 Generate JWT
const generateToken = (userId, email) => {
  return jwt.sign({ id: userId, email }, requireEnv('JWT_SECRET'), {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// ================= REGISTER =================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'All fields are required' });

    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.email);

    res.status(201).json({ success: true, token, user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================= LOGIN =================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email & password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = generateToken(user.id, user.email);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================= GOOGLE LOGIN =================
router.post('/google-login', async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!email)
      return res.status(400).json({ success: false, message: 'Email required' });

    let result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let user;

    if (result.rows.length > 0) {
      user = result.rows[0];
    } else {
      const generatedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const insert = await pool.query(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
        [name || 'Google User', email, generatedPassword]
      );
      user = insert.rows[0];
    }

    const token = generateToken(user.id, user.email);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });

  } catch (err) {
    console.error('Google login error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================= ME =================
router.get('/me', protect, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [req.user.id]
    );

    res.json({ success: true, user: result.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ================= FORGOT PASSWORD =================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, frontendUrl } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0)
      return res.json({ success: true });

    const user = result.rows[0];

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    await sendResetEmail(user.email, token, user.name, frontendUrl);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ================= RESET PASSWORD =================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ success: false });

    const userId = result.rows[0].user_id;

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashed, userId]
    );

    await pool.query(
      'DELETE FROM password_resets WHERE token = $1',
      [token]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
