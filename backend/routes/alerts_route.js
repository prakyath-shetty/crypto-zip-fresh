const express = require('express');
const router = express.Router();
const db = require('../db');
const { protect } = require('../middleware/auth');
const { sendAlertEmail } = require('../utils/sendEmail');

const ALERT_PRICE_CACHE = new Map();
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || process.env.COINGECKO_DEMO_API_KEY || '';

function getCoinGeckoHeaders() {
    const headers = {
        'Accept': 'application/json',
        'User-Agent': 'CryptoTrack/1.0 (+https://crypto-zip-fresh-chi.vercel.app)'
    };
    if (COINGECKO_API_KEY) {
        headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
    }
    return headers;
}

function getAlertPriceCache(key) {
    const hit = ALERT_PRICE_CACHE.get(key);
    if (!hit) return null;
    return hit.data;
}

function setAlertPriceCache(key, data, ttlMs) {
    ALERT_PRICE_CACHE.set(key, {
        data,
        expiresAt: Date.now() + ttlMs
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAlertPrices(ids) {
    const normalizedIds = [...new Set(String(ids || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean))]
        .sort()
        .join(',');

    if (!normalizedIds) {
        return {};
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${normalizedIds}&vs_currencies=usd&include_24hr_change=true`;
    const cacheEntry = ALERT_PRICE_CACHE.get(url);
    const cached = getAlertPriceCache(url);
    if (cached && cacheEntry?.expiresAt > Date.now()) return cached;

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(8000),
                headers: getCoinGeckoHeaders()
            });
            if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`);
            const prices = await response.json();
            setAlertPriceCache(url, prices, 45 * 1000);
            return prices;
        } catch (error) {
            lastError = error;
            await delay((attempt + 1) * 900);
        }
    }

    if (cached) return cached;
    throw lastError || new Error('Price fetch failed');
}

// GET /api/alerts
router.get('/', protect, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, alerts: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/alerts — create alert
router.post('/', protect, async (req, res) => {
    const { coin_id, coin_name, symbol, condition, target_price, note } = req.body;
    if (!coin_id || !condition || !target_price) {
        return res.status(400).json({
            success: false,
            message: 'Missing fields: coin_id, condition, and target_price are required.'
        });
    }
    if (!['above', 'below'].includes(condition)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid condition. Must be "above" or "below".'
        });
    }

    const price = parseFloat(target_price);
    if (isNaN(price) || price <= 0) {
        return res.status(400).json({
            success: false,
            message: 'target_price must be a positive number.'
        });
    }
    if (note && note.length > 200) {
        return res.status(400).json({
            success: false,
            message: 'Note must be 200 characters or fewer.'
        });
    }

    try {
        const result = await db.query(
            `
            INSERT INTO alerts (user_id, coin_id, coin_name, symbol, condition, target_price, note, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'waiting') RETURNING *
            `,
            [req.user.id, coin_id, coin_name, symbol, condition, price, note || null]
        );
        res.json({ success: true, alert: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/alerts/prices — fetch live prices from CoinGecko + run alert check server-side
router.get('/prices', protect, async (req, res) => {
    try {
        const requestedIds = [...new Set(String(req.query.ids || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean))];

        const alertsRes = await db.query(
            `SELECT * FROM alerts WHERE user_id = $1 AND status = 'waiting'`,
            [req.user.id]
        );
        const waitingAlerts = alertsRes.rows;

        const alertCoinIds = [...new Set(waitingAlerts.map((alert) => alert.coin_id).filter(Boolean))];
        const effectiveIds = requestedIds.length
            ? alertCoinIds.filter((coinId) => requestedIds.includes(coinId))
            : alertCoinIds;

        if (!effectiveIds.length) {
            return res.json({ success: true, prices: {}, triggered: [] });
        }

        const prices = await fetchAlertPrices(effectiveIds.join(','));

        const triggered = [];
        for (const alert of waitingAlerts) {
            if (!effectiveIds.includes(alert.coin_id)) continue;
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
                for (const alert of triggered) {
                    const alertLink = `${process.env.FRONTEND_URL || 'http://127.0.0.1:5500'}/pages/alerts.html?alertId=${alert.id}`;
                    try {
                        await sendAlertEmail(user.email, user.name, {
                            coinName: alert.coin_name,
                            symbol: alert.symbol,
                            condition: alert.condition,
                            targetPrice: alert.target_price,
                            currentPrice: alert.current_price,
                            alertLink
                        });
                    } catch (mailErr) {
                        console.error('Alert email send failed:', mailErr.message || mailErr);
                    }
                }
            }
        }

        res.json({ success: true, prices, triggered });
    } catch (e) {
        console.error('Alert price/trigger check failed:', e.message || e);
        res.json({ success: true, prices: {}, triggered: [] });
    }
});

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
    if (!status || !ALLOWED.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Invalid status. Must be one of: ${ALLOWED.join(', ')}.`
        });
    }

    try {
        const result = await db.query(
            'UPDATE alerts SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING id',
            [status, req.params.id, req.user.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Alert not found or not yours.' });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
