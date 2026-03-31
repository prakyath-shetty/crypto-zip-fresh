const express = require('express');
const router = express.Router();
const db = require('../db');
const { protect } = require('../middleware/auth');

// GET /api/transactions — get all transactions for user
router.get('/', protect, async (req, res) => {
    try {
        const { type, limit } = req.query;
        let query = 'SELECT *, price AS price_per_coin, total AS total_value, amount AS quantity FROM transactions WHERE user_id = $1';
        const params = [req.user.id];
        if (type && type !== 'all') {
            query += ' AND type = $2';
            params.push(type);
        }
        query += ' ORDER BY created_at DESC';
        if (limit) query += ` LIMIT ${parseInt(limit)}`;

        const result = await db.query(query, params);
        res.json({ success: true, transactions: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
