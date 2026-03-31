const express = require('express');

const router = express.Router();
const CACHE = new Map();
const BASE_URL = 'https://api.coingecko.com/api/v3';

function getCached(key) {
    const hit = CACHE.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        CACHE.delete(key);
        return null;
    }
    return hit.data;
}

function setCached(key, data, ttlMs) {
    CACHE.set(key, {
        data,
        expiresAt: Date.now() + ttlMs
    });
}

async function fetchCoinGeckoJson(url, ttlMs) {
    const cached = getCached(url);
    if (cached) return cached;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
        throw new Error(`CoinGecko error ${response.status}`);
    }

    const json = await response.json();
    setCached(url, json, ttlMs);
    return json;
}

function queryString(params, keys) {
    const qs = new URLSearchParams();
    keys.forEach((key) => {
        const value = params[key];
        if (value !== undefined && value !== null && value !== '') {
            qs.set(key, String(value));
        }
    });
    return qs.toString();
}

router.get('/simple/price', async (req, res) => {
    const { ids, vs_currencies = 'usd', include_24hr_change = 'true' } = req.query;
    if (!ids) {
        return res.status(400).json({ success: false, message: 'ids query param required' });
    }

    try {
        const qs = queryString(
            { ids, vs_currencies, include_24hr_change },
            ['ids', 'vs_currencies', 'include_24hr_change']
        );
        const data = await fetchCoinGeckoJson(`${BASE_URL}/simple/price?${qs}`, 45 * 1000);
        res.json(data);
    } catch (error) {
        res.status(502).json({ success: false, message: error.message });
    }
});

router.get('/global', async (req, res) => {
    try {
        const data = await fetchCoinGeckoJson(`${BASE_URL}/global`, 5 * 60 * 1000);
        res.json(data);
    } catch (error) {
        res.status(502).json({ success: false, message: error.message });
    }
});

router.get('/coins/markets', async (req, res) => {
    try {
        const qs = queryString(
            {
                vs_currency: req.query.vs_currency || 'usd',
                ids: req.query.ids,
                order: req.query.order || 'market_cap_desc',
                per_page: req.query.per_page || '20',
                page: req.query.page || '1',
                price_change_percentage: req.query.price_change_percentage || '24h',
                sparkline: req.query.sparkline || 'false'
            },
            ['vs_currency', 'ids', 'order', 'per_page', 'page', 'price_change_percentage', 'sparkline']
        );
        const data = await fetchCoinGeckoJson(`${BASE_URL}/coins/markets?${qs}`, 2 * 60 * 1000);
        res.json(data);
    } catch (error) {
        res.status(502).json({ success: false, message: error.message });
    }
});

router.get('/coins/:coinId/market_chart', async (req, res) => {
    const { coinId } = req.params;
    if (!coinId) {
        return res.status(400).json({ success: false, message: 'coinId param required' });
    }

    try {
        const qs = queryString(
            {
                vs_currency: req.query.vs_currency || 'usd',
                days: req.query.days || '30',
                interval: req.query.interval
            },
            ['vs_currency', 'days', 'interval']
        );
        const data = await fetchCoinGeckoJson(`${BASE_URL}/coins/${coinId}/market_chart?${qs}`, 5 * 60 * 1000);
        res.json(data);
    } catch (error) {
        res.status(502).json({ success: false, message: error.message });
    }
});

router.get('/coins/:coinId', async (req, res) => {
    const { coinId } = req.params;
    if (!coinId) {
        return res.status(400).json({ success: false, message: 'coinId param required' });
    }

    try {
        const qs = queryString(
            {
                localization: req.query.localization || 'false',
                tickers: req.query.tickers || 'false',
                community_data: req.query.community_data || 'false',
                developer_data: req.query.developer_data || 'false'
            },
            ['localization', 'tickers', 'community_data', 'developer_data']
        );
        const data = await fetchCoinGeckoJson(`${BASE_URL}/coins/${coinId}?${qs}`, 10 * 60 * 1000);
        res.json(data);
    } catch (error) {
        res.status(502).json({ success: false, message: error.message });
    }
});

module.exports = router;
