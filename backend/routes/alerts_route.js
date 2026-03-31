const express = require('express');
const router = express.Router();
const db = require('../db');
const { protect } = require('../middleware/auth');
const { sendAlertEmail } = require('../utils/sendEmail');

// GET /api/alerts
router.get('/', protect, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json({ success: true, alerts: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/alerts — create alert
router.post('/', protect, async (req, res) => {
    const { coin_id, coin_name, symbol, condition, target_price, note } = req.body;
    if (!coin_id || !condition || !target_price)
        return res.status(400).json({ success: false, message: 'Missing fields: coin_id, condition, and target_price are required.' });
    if (!['above', 'below'].includes(condition))
        return res.status(400).json({ success: false, message: 'Invalid condition. Must be "above" or "below".' });
    const price = parseFloat(target_price);
    if (isNaN(price) || price <= 0)
        return res.status(400).json({ success: false, message: 'target_price must be a positive number.' });
    if (note && note.length > 200)
        return res.status(400).json({ success: false, message: 'Note must be 200 characters or fewer.' });
    try {
        const result = await db.query(`
            INSERT INTO alerts (user_id, coin_id, coin_name, symbol, condition, target_price, note, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'waiting') RETURNING *
        `, [req.user.id, coin_id, coin_name, symbol, condition, price, note || null]);
        res.json({ success: true, alert: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/alerts/prices — fetch live prices from CoinGecko + run alert check, all server-side
// Query param: ?ids=bitcoin,ethereum,solana,...
router.get('/prices', protect, async (req, res) => {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ success: false, message: 'ids query param required.' });
    try {
        const cgRes = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!cgRes.ok) throw new Error(`CoinGecko error: ${cgRes.status}`);
        const prices = await cgRes.json();

        // Run alert check inline — same logic as /check
        const alertsRes = await db.query(
            `SELECT * FROM alerts WHERE user_id = $1 AND status = 'waiting'`,
            [req.user.id]
        );
        const triggered = [];
        for (const alert of alertsRes.rows) {
            const currentPrice = prices[alert.coin_id]?.usd;
            if (!currentPrice) continue;
            const target = parseFloat(alert.target_price);
            const shouldTrigger =
                (alert.condition === 'above' && currentPrice >= target) ||
                (alert.condition === 'below' && currentPrice <= target);
            if (shouldTrigger) {
                await db.query(`UPDATE alerts SET status = 'triggered' WHERE id = $1`, [alert.id]);
                triggered.push({ ...alert, current_price: currentPrice });
            }
        }
        if (triggered.length > 0) {
            const userRes = await db.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
            const user = userRes.rows[0];
            if (user?.email) {
                for (const a of triggered) {
    const alertLink = `${process.env.FRONTEND_URL || 'http://127.0.0.1:5500'}/pages/alerts.html?alertId=${a.id}`;

    await sendAlertEmail(user.email, user.name, {
        coinName: a.coin_name,
        symbol: a.symbol,
        condition: a.condition,
        targetPrice: a.target_price,
        currentPrice: a.current_price,
        alertLink: alertLink   // 👈 PASS IT HERE
    });
}
            }
        }
        res.json({ success: true, prices, triggered });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/alerts/check — server-side alert trigger check
// Body: { prices: { bitcoin: 95000, ethereum: 3200, ... } }


// DELETE /api/alerts/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        const result = await db.query(
            'DELETE FROM alerts WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Alert not found or not yours.' });
        }
        res.json({ success: true, message: 'Alert deleted', id: req.params.id });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PATCH /api/alerts/:id/status — update status
router.patch('/:id/status', protect, async (req, res) => {
    const { status } = req.body;
    const ALLOWED = ['waiting', 'inactive', 'triggered'];
    if (!status || !ALLOWED.includes(status))
        return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${ALLOWED.join(', ')}.` });
    try {
        const result = await db.query(
            'UPDATE alerts SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING id',
            [status, req.params.id, req.user.id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ success: false, message: 'Alert not found or not yours.' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
