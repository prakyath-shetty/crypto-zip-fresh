const express = require('express');
const router = express.Router();
const db = require('../db');
const { protect } = require('../middleware/auth');

// GET /api/holdings — get all user holdings
router.get('/', protect, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT *, amount AS quantity, buy_price AS avg_buy_price FROM holdings WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, holdings: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/holdings/buy — buy a coin
router.post('/buy', protect, async (req, res) => {
    const { coin_id, coin_name, symbol, amount, buy_price, icon, icon_color, icon_bg } = req.body;
    if (!coin_id || !amount || !buy_price) return res.status(400).json({ success: false, message: 'Missing fields' });

    const totalCost = parseFloat(amount) * parseFloat(buy_price);
    try {
        // Check balance
        const wallet = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
        if (!wallet.rows.length || parseFloat(wallet.rows[0].balance) < totalCost)
            return res.status(400).json({ success: false, message: 'Insufficient balance' });

        // Deduct balance
        await db.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2', [totalCost, req.user.id]);

        // Add or update holding
        const existing = await db.query('SELECT * FROM holdings WHERE user_id = $1 AND coin_id = $2', [req.user.id, coin_id]);
        if (existing.rows.length > 0) {
            const old = existing.rows[0];
            const newAmt = parseFloat(old.amount) + parseFloat(amount);
            const newAvgPrice = ((parseFloat(old.amount) * parseFloat(old.buy_price)) + totalCost) / newAmt;
            await db.query(
                'UPDATE holdings SET amount = $1, buy_price = $2, updated_at = NOW() WHERE user_id = $3 AND coin_id = $4',
                [newAmt, newAvgPrice, req.user.id, coin_id]
            );
        } else {
            await db.query(`
                INSERT INTO holdings (user_id, coin_id, coin_name, symbol, amount, buy_price, icon, icon_color, icon_bg)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            `, [req.user.id, coin_id, coin_name, symbol, amount, buy_price, icon || symbol[0], icon_color || '#00e5ff', icon_bg || 'rgba(0,229,255,0.2)']);
        }

        // Record transaction
        await db.query(`
            INSERT INTO transactions (user_id, type, coin_id, coin_name, symbol, amount, price, total)
            VALUES ($1,'buy',$2,$3,$4,$5,$6,$7)
        `, [req.user.id, coin_id, coin_name, symbol, amount, buy_price, totalCost]);

        const updated = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, message: `Bought ${amount} ${symbol}`, balance: parseFloat(updated.rows[0].balance) });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/holdings/sell — sell a coin
router.post('/sell', protect, async (req, res) => {
    const { coin_id, symbol, amount, sell_price } = req.body;
    if (!coin_id || !amount || !sell_price) return res.status(400).json({ success: false, message: 'Missing fields' });

    try {
        const holding = await db.query('SELECT * FROM holdings WHERE user_id = $1 AND coin_id = $2', [req.user.id, coin_id]);
        if (!holding.rows.length) return res.status(400).json({ success: false, message: 'You do not own this coin' });

        const owned = parseFloat(holding.rows[0].amount);
        const sellAmt = parseFloat(amount);
        if (sellAmt > owned) return res.status(400).json({ success: false, message: 'Not enough coins to sell' });

        const totalEarned = sellAmt * parseFloat(sell_price);

        // Update or remove holding
        if (Math.abs(owned - sellAmt) < 0.000001) {
            await db.query('DELETE FROM holdings WHERE user_id = $1 AND coin_id = $2', [req.user.id, coin_id]);
        } else {
            await db.query('UPDATE holdings SET amount = amount - $1, updated_at = NOW() WHERE user_id = $2 AND coin_id = $3', [sellAmt, req.user.id, coin_id]);
        }

        // Add to balance
        await db.query('UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2', [totalEarned, req.user.id]);

        // Record transaction
        await db.query(`
            INSERT INTO transactions (user_id, type, coin_id, coin_name, symbol, amount, price, total)
            VALUES ($1,'sell',$2,$3,$4,$5,$6,$7)
        `, [req.user.id, coin_id, holding.rows[0].coin_name, symbol, sellAmt, sell_price, totalEarned]);

        const updated = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, message: `Sold ${amount} ${symbol}`, balance: parseFloat(updated.rows[0].balance) });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// DELETE /api/holdings/:coin_id — remove holding manually
router.delete('/:coin_id', protect, async (req, res) => {
    try {
        await db.query('DELETE FROM holdings WHERE user_id = $1 AND coin_id = $2', [req.user.id, req.params.coin_id]);
        res.json({ success: true, message: 'Holding removed' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
