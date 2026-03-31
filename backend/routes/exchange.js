const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { protect } = require('../middleware/auth');
const { requireEnv } = require('../config/env');
require('dotenv').config();

// ── ENCRYPTION helpers (store API keys securely) ──
const ALGO = 'aes-256-cbc';

function getEncryptionKey() {
    return crypto.scryptSync(requireEnv('JWT_SECRET'), 'salt', 32);
}

function encrypt(text) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text || typeof text !== 'string' || !text.includes(':')) {
        throw new Error('Invalid encrypted value — possible NULL or wrong format');
    }
    const colonIndex = text.indexOf(':');
    const ivHex = text.substring(0, colonIndex);
    const encHex = text.substring(colonIndex + 1);
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
}

// ── CREATE exchange_connections TABLE ──
const initExchangeTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS exchange_connections (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            exchange VARCHAR(50) NOT NULL,
            api_key TEXT NOT NULL,
            api_secret TEXT NOT NULL,
            passphrase TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, exchange)
        );
    `);
};
initExchangeTable().catch((err) => {
    console.error('exchange_connections table init error:', err.message);
});

// ════════════════════════════════════════
// POST /api/exchange/connect
// Save encrypted API keys
// ════════════════════════════════════════
router.post('/connect', protect, async (req, res) => {
    try {
        const { exchange, apiKey, apiSecret, passphrase } = req.body;
        const userId = req.user.id;

        if (!exchange || !apiKey || !apiSecret) {
            return res.status(400).json({ success: false, message: 'Exchange, API key and secret are required' });
        }

        const validExchanges = ['binance', 'kucoin', 'coindcx', 'coinbase'];
        if (!validExchanges.includes(exchange)) {
            return res.status(400).json({ success: false, message: 'Invalid exchange' });
        }

        // Encrypt keys
        const encKey = encrypt(apiKey);
        const encSecret = encrypt(apiSecret);
        const encPassphrase = passphrase ? encrypt(passphrase) : null;

        // Verify keys work before saving
        const testResult = await testExchangeConnection(exchange, apiKey, apiSecret, passphrase);
        if (!testResult.success) {
            return res.status(400).json({ success: false, message: testResult.message });
        }

        // Save or update
        await pool.query(`
            INSERT INTO exchange_connections (user_id, exchange, api_key, api_secret, passphrase)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, exchange)
            DO UPDATE SET api_key=$3, api_secret=$4, passphrase=$5, is_active=true
        `, [userId, exchange, encKey, encSecret, encPassphrase]);

        res.json({ success: true, message: `${exchange} connected successfully!` });

    } catch (err) {
        console.error('Connect exchange error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ════════════════════════════════════════
// GET /api/exchange/portfolio
// Fetch holdings from all connected exchanges
// ════════════════════════════════════════
router.get('/portfolio', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const filterExchange = req.query.exchange || null;

        const queryText = filterExchange
            ? 'SELECT * FROM exchange_connections WHERE user_id = $1 AND is_active = true AND exchange = $2'
            : 'SELECT * FROM exchange_connections WHERE user_id = $1 AND is_active = true';
        const queryParams = filterExchange ? [userId, filterExchange] : [userId];

        const result = await pool.query(queryText, queryParams);

        if (result.rows.length === 0) {
            return res.json({ success: true, holdings: [], exchanges: [] });
        }

        const allHoldings = [];
        const connectedExchanges = [];
        const errors = [];

        for (const conn of result.rows) {
            try {
                const apiKey = decrypt(conn.api_key);
                const apiSecret = decrypt(conn.api_secret);
                const passphrase = conn.passphrase ? decrypt(conn.passphrase) : null;

                const holdings = await fetchHoldings(conn.exchange, apiKey, apiSecret, passphrase);
                allHoldings.push(...holdings.map(h => ({ ...h, exchange: conn.exchange })));
                connectedExchanges.push(conn.exchange);
            } catch (e) {
                console.error(`Error fetching ${conn.exchange}:`, e.message);
                errors.push({ exchange: conn.exchange, error: e.message });
            }
        }

        res.json({
            success: true,
            holdings: allHoldings,
            exchanges: connectedExchanges,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (err) {
        console.error('Portfolio fetch error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── DEBUG ROUTE (remove in production) ──
router.get('/debug', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT exchange, is_active, LENGTH(api_key) as key_len FROM exchange_connections WHERE user_id = $1',
            [userId]
        );
        if (result.rows.length === 0) {
            return res.json({ connected: false, message: 'No exchanges in database' });
        }
        const details = [];
        for (const conn of result.rows) {
            try {
                const fullRow = await pool.query(
                    'SELECT * FROM exchange_connections WHERE user_id = $1 AND exchange = $2',
                    [userId, conn.exchange]
                );
                const r = fullRow.rows[0];
                const apiKey = decrypt(r.api_key);
                const apiSecret = decrypt(r.api_secret);
                const passphrase = r.passphrase ? decrypt(r.passphrase) : null;
                const holdings = await fetchHoldings(conn.exchange, apiKey, apiSecret, passphrase);
                details.push({ exchange: conn.exchange, status: 'ok', holdingsCount: holdings.length, sample: holdings.slice(0, 3) });
            } catch (e) {
                details.push({ exchange: conn.exchange, status: 'error', error: e.message });
            }
        }
        res.json({ connected: true, exchanges: result.rows, details });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
// GET /api/exchange/list
// Get list of connected exchanges for user
// ════════════════════════════════════════
router.get('/list', protect, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT exchange, is_active, created_at FROM exchange_connections WHERE user_id = $1',
            [req.user.id]
        );
        res.json({ success: true, exchanges: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ════════════════════════════════════════
// DELETE /api/exchange/:exchange
// Disconnect an exchange
// ════════════════════════════════════════
router.delete('/:exchange', protect, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM exchange_connections WHERE user_id = $1 AND exchange = $2',
            [req.user.id, req.params.exchange]
        );
        res.json({ success: true, message: `${req.params.exchange} disconnected` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ════════════════════════════════════════
//  EXCHANGE API FUNCTIONS
// ════════════════════════════════════════

async function testExchangeConnection(exchange, apiKey, apiSecret, passphrase) {
    try {
        switch (exchange) {
            case 'binance':  return await testBinance(apiKey, apiSecret);
            case 'kucoin':   return await testKuCoin(apiKey, apiSecret, passphrase);
            case 'coindcx':  return await testCoinDCX(apiKey, apiSecret);
            case 'coinbase': return await testCoinbase(apiKey, apiSecret, passphrase);
            default: return { success: false, message: 'Unknown exchange' };
        }
    } catch (e) {
        return { success: false, message: 'Connection failed: ' + e.message };
    }
}

async function fetchHoldings(exchange, apiKey, apiSecret, passphrase) {
    switch (exchange) {
        case 'binance':  return await fetchBinanceHoldings(apiKey, apiSecret);
        case 'kucoin':   return await fetchKuCoinHoldings(apiKey, apiSecret, passphrase);
        case 'coindcx':  return await fetchCoinDCXHoldings(apiKey, apiSecret);
        case 'coinbase': return await fetchCoinbaseHoldings(apiKey, apiSecret, passphrase);
        default: return [];
    }
}

// ── BINANCE ──
async function binanceRequest(path, apiKey, apiSecret, params = {}) {
    const timestamp = Date.now();
    const queryParams = new URLSearchParams({ ...params, timestamp });
    const signature = crypto.createHmac('sha256', apiSecret).update(queryParams.toString()).digest('hex');
    queryParams.append('signature', signature);

    const res = await fetch(`https://api.binance.com${path}?${queryParams}`, {
        headers: { 'X-MBX-APIKEY': apiKey }
    });
    if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
    return res.json();
}

async function testBinance(apiKey, apiSecret) {
    try {
        await binanceRequest('/api/v3/account', apiKey, apiSecret);
        return { success: true };
    } catch (e) {
        return { success: false, message: 'Invalid Binance API keys. Check your key and permissions.' };
    }
}

async function fetchBinanceHoldings(apiKey, apiSecret) {
    const account = await binanceRequest('/api/v3/account', apiKey, apiSecret);
    return account.balances
        .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map(b => ({
            symbol: b.asset,
            balance: parseFloat(b.free) + parseFloat(b.locked),
            free: parseFloat(b.free),
            locked: parseFloat(b.locked)
        }));
}

// ── KUCOIN ──
function kuCoinSignature(apiSecret, timestamp, method, endpoint, body = '') {
    const str = timestamp + method + endpoint + body;
    return crypto.createHmac('sha256', apiSecret).update(str).digest('base64');
}

async function kuCoinRequest(endpoint, apiKey, apiSecret, passphrase) {
    if (!passphrase) throw new Error('KuCoin requires a passphrase');
    const timestamp = Date.now().toString();
    const signature = kuCoinSignature(apiSecret, timestamp, 'GET', endpoint);
    const passphraseEnc = crypto.createHmac('sha256', apiSecret).update(passphrase).digest('base64');

    const res = await fetch(`https://api.kucoin.com${endpoint}`, {
        headers: {
            'KC-API-KEY': apiKey,
            'KC-API-SIGN': signature,
            'KC-API-TIMESTAMP': timestamp,
            'KC-API-PASSPHRASE': passphraseEnc,
            'KC-API-KEY-VERSION': '2'
        }
    });
    if (!res.ok) throw new Error(`KuCoin API error: ${res.status}`);
    return res.json();
}

async function testKuCoin(apiKey, apiSecret, passphrase) {
    try {
        const data = await kuCoinRequest('/api/v1/accounts', apiKey, apiSecret, passphrase);
        if (data.code !== '200000') throw new Error(data.msg);
        return { success: true };
    } catch (e) {
        return { success: false, message: 'Invalid KuCoin API keys. Check your key, secret and passphrase.' };
    }
}

async function fetchKuCoinHoldings(apiKey, apiSecret, passphrase) {
    const data = await kuCoinRequest('/api/v1/accounts', apiKey, apiSecret, passphrase);
    if (data.code !== '200000') throw new Error(data.msg);
    return data.data
        .filter(a => parseFloat(a.balance) > 0)
        .map(a => ({
            symbol: a.currency,
            balance: parseFloat(a.balance),
            free: parseFloat(a.available),
            locked: parseFloat(a.holds)
        }));
}

// ── COINDCX ──
async function coinDCXRequest(endpoint, apiKey, apiSecret, body = {}) {
    const timestamp = Math.floor(Date.now());
    const bodyStr = JSON.stringify({ ...body, timestamp });
    const signature = crypto.createHmac('sha256', apiSecret).update(bodyStr).digest('hex');

    const res = await fetch(`https://api.coindcx.com${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-AUTH-APIKEY': apiKey,
            'X-AUTH-SIGNATURE': signature
        },
        body: bodyStr
    });
    if (!res.ok) throw new Error(`CoinDCX API error: ${res.status}`);
    return res.json();
}

async function testCoinDCX(apiKey, apiSecret) {
    try {
        await coinDCXRequest('/exchange/v1/users/balances', apiKey, apiSecret);
        return { success: true };
    } catch (e) {
        return { success: false, message: 'Invalid CoinDCX API keys.' };
    }
}

async function fetchCoinDCXHoldings(apiKey, apiSecret) {
    const data = await coinDCXRequest('/exchange/v1/users/balances', apiKey, apiSecret);
    if (!Array.isArray(data)) throw new Error('CoinDCX returned unexpected response');
    return data
        .filter(b => parseFloat(b.balance) > 0)
        .map(b => ({
            symbol: b.currency,
            balance: parseFloat(b.balance),
            free: parseFloat(b.balance),
            locked: 0
        }));
}

// ── COINBASE ──
function coinbaseSignature(apiSecret, timestamp, method, path, body = '') {
    const message = timestamp + method + path + body;
    return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

async function coinbaseRequest(path, apiKey, apiSecret, passphrase) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = coinbaseSignature(apiSecret, timestamp, 'GET', path);

    const res = await fetch(`https://api.exchange.coinbase.com${path}`, {
        headers: {
            'CB-ACCESS-KEY': apiKey,
            'CB-ACCESS-SIGN': signature,
            'CB-ACCESS-TIMESTAMP': timestamp,
            'CB-ACCESS-PASSPHRASE': passphrase,
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) throw new Error(`Coinbase API error: ${res.status}`);
    return res.json();
}

async function testCoinbase(apiKey, apiSecret, passphrase) {
    try {
        await coinbaseRequest('/accounts', apiKey, apiSecret, passphrase);
        return { success: true };
    } catch (e) {
        return { success: false, message: 'Invalid Coinbase API keys. Check your key, secret and passphrase.' };
    }
}

async function fetchCoinbaseHoldings(apiKey, apiSecret, passphrase) {
    const data = await coinbaseRequest('/accounts', apiKey, apiSecret, passphrase);
    if (!Array.isArray(data)) throw new Error('Coinbase returned unexpected response');
    return data
        .filter(a => parseFloat(a.balance) > 0)
        .map(a => ({
            symbol: a.currency,
            balance: parseFloat(a.balance),
            free: parseFloat(a.available),
            locked: parseFloat(a.hold)
        }));
}

// ════════════════════════════════════════
// POST /api/exchange/sync-trades
// Fetch trade history from connected exchange → save to transactions
// ════════════════════════════════════════
router.post('/sync-trades', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const { exchange } = req.body;

        if (!exchange) {
            return res.status(400).json({ success: false, message: 'Exchange name is required' });
        }

        // Ensure columns exist
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_trade_id VARCHAR(100)`).catch(() => {});
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_name VARCHAR(50)`).catch(() => {});
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_trade_id ON transactions(exchange_trade_id) WHERE exchange_trade_id IS NOT NULL`).catch(() => {});

        // Get this specific exchange connection
        const connResult = await pool.query(
            'SELECT * FROM exchange_connections WHERE user_id = $1 AND exchange = $2 AND is_active = true',
            [userId, exchange]
        );
        if (connResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: `${exchange} is not connected. Connect it in Portfolio first.` });
        }

        const conn = connResult.rows[0];
        const apiKey     = decrypt(conn.api_key);
        const apiSecret  = decrypt(conn.api_secret);
        const passphrase = conn.passphrase ? decrypt(conn.passphrase) : null;

        // Fetch trades for this exchange
        const trades = await fetchExchangeTrades(exchange, apiKey, apiSecret, passphrase);

        let synced = 0;
        for (const trade of trades) {
            try {
                await pool.query(`
                    INSERT INTO transactions (user_id, type, coin_id, coin_name, symbol, amount, price, total, status, exchange_trade_id, exchange_name, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10,$11)
                    ON CONFLICT (exchange_trade_id) DO NOTHING
                `, [userId, trade.isBuyer ? 'buy' : 'sell', trade.coinId, trade.coinName,
                    trade.symbol, trade.qty, trade.price, trade.total,
                    trade.tradeId, exchange, new Date(trade.time)]);
                synced++;
            } catch (e) { /* skip duplicate */ }
        }

        res.json({
            success: true,
            synced,
            total: trades.length,
            message: `Synced ${synced} new trades from ${exchange}`
        });

    } catch (err) {
        console.error('Sync trades error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to sync: ' + err.message });
    }
});

// ── Route trades to correct exchange fetcher ──
async function fetchExchangeTrades(exchange, apiKey, apiSecret, passphrase) {
    switch (exchange) {
        case 'binance':  return await fetchBinanceTrades(apiKey, apiSecret);
        case 'kucoin':   return await fetchKuCoinTrades(apiKey, apiSecret, passphrase);
        case 'coindcx':  return await fetchCoinDCXTrades(apiKey, apiSecret);
        case 'coinbase': return await fetchCoinbaseTrades(apiKey, apiSecret, passphrase);
        default: return [];
    }
}

const COIN_MAP = {
    'BTC':'bitcoin','ETH':'ethereum','SOL':'solana','BNB':'binancecoin',
    'ADA':'cardano','XRP':'ripple','DOGE':'dogecoin','AVAX':'avalanche-2',
    'DOT':'polkadot','LINK':'chainlink','MATIC':'matic-network','LTC':'litecoin',
    'UNI':'uniswap','NEAR':'near','ATOM':'cosmos','BCH':'bitcoin-cash',
    'ALGO':'algorand','VET':'vechain','FTM':'fantom','ICP':'internet-computer'
};

// ── BINANCE trade history ──
async function fetchBinanceTrades(apiKey, apiSecret) {
    const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','ADAUSDT','XRPUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','MATICUSDT','LTCUSDT','UNIUSDT','NEARUSDT','ATOMUSDT','BCHUSDT','ALGOUSDT'];
    const allTrades = [];
    for (const symbol of SYMBOLS) {
        try {
            const data = await binanceRequest('/api/v3/myTrades', apiKey, apiSecret, { symbol, limit: 100 });
            if (!Array.isArray(data)) continue;
            const baseSym = symbol.replace('USDT', '');
            for (const t of data) {
                allTrades.push({
                    tradeId:  `binance_${t.id}`,
                    symbol:   baseSym,
                    coinId:   COIN_MAP[baseSym] || baseSym.toLowerCase(),
                    coinName: baseSym,
                    qty:      parseFloat(t.qty),
                    price:    parseFloat(t.price),
                    total:    parseFloat(t.quoteQty),
                    isBuyer:  t.isBuyer,
                    time:     t.time
                });
            }
        } catch (e) { /* symbol not traded — skip */ }
    }
    return allTrades;
}

// ── KUCOIN trade history ──
async function fetchKuCoinTrades(apiKey, apiSecret, passphrase) {
    const allTrades = [];
    try {
        const data = await kuCoinRequest('/api/v1/fills?pageSize=100', apiKey, apiSecret, passphrase);
        if (data.code !== '200000' || !data.data?.items) return [];
        for (const t of data.data.items) {
            const baseSym = t.symbol.replace('-USDT','').replace('-BTC','').replace('-ETH','');
            allTrades.push({
                tradeId:  `kucoin_${t.tradeId}`,
                symbol:   baseSym,
                coinId:   COIN_MAP[baseSym] || baseSym.toLowerCase(),
                coinName: baseSym,
                qty:      parseFloat(t.size),
                price:    parseFloat(t.price),
                total:    parseFloat(t.funds),
                isBuyer:  t.side === 'buy',
                time:     parseInt(t.createdAt)
            });
        }
    } catch (e) { /* skip */ }
    return allTrades;
}

// ── COINDCX trade history ──
async function fetchCoinDCXTrades(apiKey, apiSecret) {
    const allTrades = [];
    try {
        const data = await coinDCXRequest('/exchange/v1/orders/trade_history', apiKey, apiSecret, { limit: 100 });
        if (!Array.isArray(data)) return [];
        for (const t of data) {
            const baseSym = (t.market || '').replace('USDT','').replace('INR','');
            allTrades.push({
                tradeId:  `coindcx_${t.id}`,
                symbol:   baseSym,
                coinId:   COIN_MAP[baseSym] || baseSym.toLowerCase(),
                coinName: baseSym,
                qty:      parseFloat(t.quantity || 0),
                price:    parseFloat(t.price || 0),
                total:    parseFloat(t.quantity || 0) * parseFloat(t.price || 0),
                isBuyer:  t.order_type === 'buy_limit' || t.order_type === 'buy_market',
                time:     new Date(t.updated_at).getTime()
            });
        }
    } catch (e) { /* skip */ }
    return allTrades;
}

// ── COINBASE trade history ──
async function fetchCoinbaseTrades(apiKey, apiSecret, passphrase) {
    const allTrades = [];
    try {
        const accounts = await coinbaseRequest('/accounts', apiKey, apiSecret, passphrase);
        if (!Array.isArray(accounts)) return [];
        for (const acc of accounts.slice(0, 10)) {
            try {
                const fills = await coinbaseRequest(`/fills?product_id=${acc.currency}-USD`, apiKey, apiSecret, passphrase);
                if (!Array.isArray(fills)) continue;
                for (const t of fills) {
                    allTrades.push({
                        tradeId:  `coinbase_${t.trade_id}`,
                        symbol:   acc.currency,
                        coinId:   COIN_MAP[acc.currency] || acc.currency.toLowerCase(),
                        coinName: acc.currency,
                        qty:      parseFloat(t.size),
                        price:    parseFloat(t.price),
                        total:    parseFloat(t.size) * parseFloat(t.price),
                        isBuyer:  t.side === 'buy',
                        time:     new Date(t.created_at).getTime()
                    });
                }
            } catch (e) { /* skip */ }
        }
    } catch (e) { /* skip */ }
    return allTrades;
}

module.exports = router;
