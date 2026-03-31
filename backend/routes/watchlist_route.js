const express = require('express');
const router = express.Router();
const pool = require('../db');
const { protect } = require('../middleware/auth');

// Get user's watchlist
router.get('/', protect, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM watchlist WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json({ success: true, watchlist: result.rows });
    } catch (err) {
        console.error('Watchlist GET error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add coin to watchlist
router.post('/', protect, async (req, res) => {
    try {
        const { coin_id, symbol, name } = req.body;
        if (!coin_id || !symbol) return res.status(400).json({ success: false, message: 'Missing coin_id or symbol' });

        const result = await pool.query(
            'INSERT INTO watchlist (user_id, coin_id, symbol, name) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, coin_id) DO NOTHING RETURNING *',
            [req.user.id, coin_id, symbol, name || symbol]
        );
        res.json({ success: true, item: result.rows[0] });
    } catch (err) {
        console.error('Watchlist POST error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Remove coin from watchlist
router.delete('/:coin_id', protect, async (req, res) => {
    try {
        const { coin_id } = req.params;
        await pool.query('DELETE FROM watchlist WHERE user_id = $1 AND coin_id = $2', [req.user.id, coin_id]);
        res.json({ success: true, message: 'Removed from watchlist' });
    } catch (err) {
        console.error('Watchlist DELETE error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
