const express = require('express');

const router = express.Router();
const CACHE = new Map();
const BASE_URL = 'https://api.coingecko.com/api/v3';
const DEFAULT_STALE_MS = 30 * 60 * 1000;
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

function getCachedEntry(key) {
    return CACHE.get(key) || null;
}

function getCached(key) {
    const hit = CACHE.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) return null;
    return hit.data;
}

function getStale(key) {
    const hit = CACHE.get(key);
    if (!hit) return null;
    if (hit.staleUntil <= Date.now()) return null;
    return hit.data;
}

function setCached(key, data, ttlMs, staleMs = DEFAULT_STALE_MS) {
    CACHE.set(key, {
        data,
        expiresAt: Date.now() + ttlMs,
        staleUntil: Date.now() + ttlMs + staleMs
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCoinGeckoJson(url, ttlMs, fallbackKey = null) {
    const cached = getCached(url);
    if (cached) return cached;

    const staleEntry = getStale(url);
    const routeFallback = fallbackKey ? getStale(fallbackKey) : null;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                headers: getCoinGeckoHeaders()
            });
            if (!response.ok) {
                const error = new Error(`CoinGecko error ${response.status}`);
                error.status = response.status;
                throw error;
            }

            const json = await response.json();
            setCached(url, json, ttlMs);
            if (fallbackKey) setCached(fallbackKey, json, ttlMs);
            return json;
        } catch (error) {
            lastError = error;
            const retryable = !error.status || error.status === 429 || error.status >= 500;
            if (attempt < 2 && retryable) {
                await delay((attempt + 1) * 1200);
                continue;
            }
            break;
        }
    }

    if (staleEntry) {
        return staleEntry;
    }

    if (routeFallback) {
        return routeFallback;
    }

    throw lastError || new Error('CoinGecko request failed');
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
        const data = await fetchCoinGeckoJson(`${BASE_URL}/simple/price?${qs}`, 45 * 1000, `fallback:simple-price:${vs_currencies}:${include_24hr_change}`);
        res.json(data);
    } catch (error) {
        console.error('[market/simple/price] CoinGecko fetch failed:', error.message || error);
        res.json({});
    }
});

router.get('/global', async (req, res) => {
    try {
        const data = await fetchCoinGeckoJson(`${BASE_URL}/global`, 5 * 60 * 1000, 'fallback:global');
        res.json(data);
    } catch (error) {
        console.error('[market/global] CoinGecko fetch failed:', error.message || error);
        res.json({ data: {} });
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
        const data = await fetchCoinGeckoJson(
            `${BASE_URL}/coins/markets?${qs}`,
            2 * 60 * 1000,
            `fallback:coins-markets:${req.query.vs_currency || 'usd'}:${req.query.order || 'market_cap_desc'}:${req.query.per_page || '20'}:${req.query.page || '1'}`
        );
        res.json(data);
    } catch (error) {
        console.error('[market/coins/markets] CoinGecko fetch failed:', error.message || error);
        res.json([]);
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
        const data = await fetchCoinGeckoJson(`${BASE_URL}/coins/${coinId}/market_chart?${qs}`, 5 * 60 * 1000, `fallback:market-chart:${coinId}:${req.query.vs_currency || 'usd'}:${req.query.days || '30'}`);
        res.json(data);
    } catch (error) {
        console.error(`[market/coins/${coinId}/market_chart] CoinGecko fetch failed:`, error.message || error);
        res.json({ prices: [], total_volumes: [] });
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
        const data = await fetchCoinGeckoJson(`${BASE_URL}/coins/${coinId}?${qs}`, 10 * 60 * 1000, `fallback:coin-detail:${coinId}`);
        res.json(data);
    } catch (error) {
        console.error(`[market/coins/${coinId}] CoinGecko fetch failed:`, error.message || error);
        res.json({});
    }
});

module.exports = router;
