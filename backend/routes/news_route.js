const express = require('express');
const router  = express.Router();
const https   = require('https');
const db      = require('../db');
const { protect } = require('../middleware/auth');
const { sendNewsletterEmail } = require('../utils/sendEmail');

// ── TABLE INIT ──────────────────────────────────────────────────────────────
db.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id            SERIAL PRIMARY KEY,
        email         VARCHAR(255) UNIQUE NOT NULL,
        user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subscribed_at TIMESTAMP DEFAULT NOW()
    )
`).catch(e => console.error('newsletter table init:', e.message));

// ── SIMPLE HTTPS GET ────────────────────────────────────────────────────────
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => body += c);
            res.on('end', () => resolve(body));
        }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('Timeout')); });
    });
}

// ── IN-MEMORY CACHE (5 min) ─────────────────────────────────────────────────
let _cache = null, _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

// ── GET /api/news/feed ──────────────────────────────────────────────────────
router.get('/feed', async (req, res) => {
    try {
        // Serve cache if fresh
        if (_cache && Date.now() - _cacheAt < CACHE_TTL) {
            return res.json({ success: true, articles: _cache });
        }

        const key = process.env.NEWSDATA_API_KEY;
        if (!key) return res.status(500).json({ success: false, message: 'NEWSDATA_API_KEY not set in .env' });

        const url  = `https://newsdata.io/api/1/news?apikey=${key}&q=crypto+bitcoin+ethereum&language=en`;
        console.log('[news] fetching:', url.replace(key, key.slice(0,8)+'...'));
        const body = await httpsGet(url);
        const data = JSON.parse(body);
        console.log('[news] NewsData response status:', data.status, '| message:', data.message || 'none');

        if (data.status !== 'success' || !data.results?.length) {
            return res.status(502).json({ success: false, message: `NewsData error: ${data.message || JSON.stringify(data)}` });
        }

        const articles = data.results.map(a => ({
            title:  a.title  || 'Untitled',
            source: a.source_id || 'Unknown',
            time:   a.pubDate ? Math.floor(new Date(a.pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000),
            url:    a.link   || '#',
            body:   a.description ? a.description.replace(/<[^>]*>/g, '').slice(0, 150) + '...' : ''
        })).filter(a => a.url !== '#');

        _cache   = articles;
        _cacheAt = Date.now();

        res.json({ success: true, articles });
    } catch (e) {
        console.error('News feed error:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── POST /api/news/subscribe ────────────────────────────────────────────────
router.post('/subscribe', protect, async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    try {
        await db.query(`
            INSERT INTO newsletter_subscribers (email, user_id)
            VALUES ($1, $2)
            ON CONFLICT (email) DO NOTHING
        `, [email, req.user.id]);
        await sendNewsletterEmail(email);
        res.json({ success: true, message: 'Subscribed successfully!' });
    } catch (e) {
        console.error('Newsletter subscribe error:', e.message);
        res.status(500).json({ success: false, message: 'Could not subscribe: ' + e.message });
    }
});

module.exports = router;
