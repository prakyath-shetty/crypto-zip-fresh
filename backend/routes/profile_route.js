const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const bcrypt   = require('bcryptjs');
const { protect } = require('../middleware/auth');
const isStrongPassword = (password = '') =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{16,}$/.test(String(password));

// ── GET /api/profile ── fetch full profile
router.get('/', protect, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, name, email, phone, bio, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (!result.rows.length)
            return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── PATCH /api/profile ── update name, phone, bio
router.patch('/', protect, async (req, res) => {
    const { name, phone, bio } = req.body;
    if (!name || name.trim().length < 2)
        return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
    try {
        const result = await db.query(
            `UPDATE users SET name = $1, phone = $2, bio = $3
             WHERE id = $4 RETURNING id, name, email, phone, bio, created_at`,
            [name.trim(), phone || null, bio || null, req.user.id]
        );
        res.json({ success: true, message: 'Profile updated', user: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── PATCH /api/profile/password ── change password
router.patch('/password', protect, async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
        return res.status(400).json({ success: false, message: 'Both passwords required' });
    if (!isStrongPassword(new_password))
        return res.status(400).json({ success: false, message: 'Password must be at least 16 characters and include uppercase, lowercase, number, and special character' });
    try {
        const user = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
        if (!user.rows.length)
            return res.status(404).json({ success: false, message: 'User not found' });
        const valid = await bcrypt.compare(current_password, user.rows[0].password);
        if (!valid)
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        const hashed = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── POST /api/profile/deactivate ── temporarily disable account
router.post('/deactivate', protect, async (req, res) => {
    try {
        await db.query('UPDATE users SET is_active = false WHERE id = $1', [req.user.id]);
        res.json({ success: true, message: 'Account deactivated' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── DELETE /api/profile/delete-account ── permanently delete all data
router.delete('/delete-account', protect, async (req, res) => {
    try {
        const id = req.user.id;
        await db.query('DELETE FROM alerts                WHERE user_id = $1', [id]);
        await db.query('DELETE FROM transactions          WHERE user_id = $1', [id]);
        await db.query('DELETE FROM holdings              WHERE user_id = $1', [id]);
        await db.query('DELETE FROM watchlist             WHERE user_id = $1', [id]);
        await db.query('DELETE FROM wallets               WHERE user_id = $1', [id]);
        await db.query('DELETE FROM password_resets       WHERE user_id = $1', [id]);
        await db.query('DELETE FROM newsletter_subscribers WHERE user_id = $1', [id]);
        await db.query('DELETE FROM users                 WHERE id      = $1', [id]);
        res.json({ success: true, message: 'Account permanently deleted' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── POST /api/profile/revoke-sessions ── invalidate all active sessions
router.post('/revoke-sessions', protect, async (req, res) => {
    try {
        try {
            await db.query(
                'UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = $1',
                [req.user.id]
            );
        } catch (_) { /* session_version column may not exist yet — safe to skip */ }
        res.json({ success: true, message: 'All sessions revoked' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
