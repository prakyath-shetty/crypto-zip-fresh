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

const demoVerificationStore = new Map();

const normalizePhone = (phone = '') => String(phone).replace(/\D/g, '');
const isStrongPassword = (password = '') =>
  /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/.test(String(password));
const maskAadhaar = (aadhaar = '') => {
  const digits = String(aadhaar).replace(/\D/g, '');
  if (digits.length < 4) return digits;
  return `XXXX-XXXX-${digits.slice(-4)}`;
};

// 🔐 Generate JWT
const generateToken = (userId, email) => {
  return jwt.sign({ id: userId, email }, requireEnv('JWT_SECRET'), {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// ================= REGISTER =================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    if (!name || !email || !password || !normalizedPhone)
      return res.status(400).json({ success: false, message: 'All fields are required' });

    if (!isStrongPassword(password))
      return res.status(400).json({ success: false, message: 'Password must be at least 10 characters and include an uppercase letter, a number, and a special character' });

    if (normalizedPhone.length < 10)
      return res.status(400).json({ success: false, message: 'Enter a valid phone number' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, phone, phone_verified, demo_kyc_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, phone_verified, demo_kyc_verified`,
      [name, email, hashedPassword, normalizedPhone, false, false]
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
    const { email, password, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    if (!email || !password || !normalizedPhone)
      return res.status(400).json({ success: false, message: 'Email, password and phone number are required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (user.phone) {
      if (normalizePhone(user.phone) !== normalizedPhone) {
        return res.status(401).json({ success: false, message: 'Phone number does not match this account' });
      }
    } else {
      await pool.query(
        'UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2',
        [normalizedPhone, user.id]
      );
      user.phone = normalizedPhone;
    }

    const token = generateToken(user.id, user.email);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phone_verified: !!user.phone_verified,
        demo_kyc_verified: !!user.demo_kyc_verified,
        aadhaar_masked: user.aadhaar_masked || null
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================= GOOGLE LOGIN =================
router.post('/google-login', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

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
        'INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4) RETURNING *',
        [name || 'Google User', email, generatedPassword, normalizedPhone || null]
      );
      user = insert.rows[0];
    }

    if (user && !user.phone && normalizedPhone) {
      const updated = await pool.query(
        'UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [normalizedPhone, user.id]
      );
      user = updated.rows[0];
    }

    const token = generateToken(user.id, user.email);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phone_verified: !!user.phone_verified,
        demo_kyc_verified: !!user.demo_kyc_verified,
        aadhaar_masked: user.aadhaar_masked || null
      }
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
      `SELECT id, name, email, phone, phone_verified, demo_kyc_verified,
              aadhaar_name, aadhaar_masked, bio, country, currency, avatar_url,
              created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    res.json({ success: true, user: result.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

router.get('/demo-verification/status', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT name, email, phone, phone_verified, demo_kyc_verified, aadhaar_name, aadhaar_masked
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];
    const pending = demoVerificationStore.get(req.user.id);

    res.json({
      success: true,
      verification: {
        phone: user?.phone || '',
        phone_verified: !!user?.phone_verified,
        demo_kyc_verified: !!user?.demo_kyc_verified,
        aadhaar_name: user?.aadhaar_name || user?.name || '',
        aadhaar_masked: user?.aadhaar_masked || '',
        otp_active: !!pending,
        otp_preview: pending?.otp || null,
        otp_expires_at: pending?.expiresAt || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not load verification status' });
  }
});

router.post('/demo-verification/start', protect, async (req, res) => {
  try {
    const { fullName, aadhaarNumber, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const aadhaarDigits = String(aadhaarNumber || '').replace(/\D/g, '');

    if (!fullName || !normalizedPhone || !aadhaarDigits) {
      return res.status(400).json({ success: false, message: 'Name, phone and Aadhaar number are required' });
    }

    if (normalizedPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Enter a valid phone number' });
    }

    if (aadhaarDigits.length !== 12) {
      return res.status(400).json({ success: false, message: 'Aadhaar number must be 12 digits for this demo' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    demoVerificationStore.set(req.user.id, {
      otp,
      expiresAt,
      fullName: String(fullName).trim(),
      aadhaarDigits,
      phone: normalizedPhone
    });

    res.json({
      success: true,
      message: ' OTP generated. Use the code shown in the dashboard to continue.',
      otp,
      expiresAt,
      aadhaarMasked: maskAadhaar(aadhaarDigits)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not generate demo OTP' });
  }
});

router.post('/demo-verification/complete', protect, async (req, res) => {
  try {
    const { otp } = req.body;
    const pending = demoVerificationStore.get(req.user.id);

    if (!pending) {
      return res.status(400).json({ success: false, message: 'Generate an OTP first' });
    }

    if (Date.now() > new Date(pending.expiresAt).getTime()) {
      demoVerificationStore.delete(req.user.id);
      return res.status(400).json({ success: false, message: 'OTP expired. Generate a new one.' });
    }

    if (String(otp || '').trim() !== pending.otp) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP' });
    }

    const updated = await pool.query(
      `UPDATE users
       SET name = $1,
           phone = $2,
           phone_verified = true,
           demo_kyc_verified = true,
           aadhaar_name = $1,
           aadhaar_masked = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, email, phone, phone_verified, demo_kyc_verified, aadhaar_name, aadhaar_masked`,
      [pending.fullName, pending.phone, maskAadhaar(pending.aadhaarDigits), req.user.id]
    );

    demoVerificationStore.delete(req.user.id);

    res.json({
      success: true,
      message: ' identity verification completed',
      user: updated.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not verify OTP' });
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

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 10 characters and include an uppercase letter, a number, and a special character'
      });
    }

    const result = await pool.query(
      'SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link' });

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

    res.json({ success: true, message: 'Password reset successful' });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not reset password' });
  }
});

module.exports = router;
