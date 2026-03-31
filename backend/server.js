const express = require('express');
const cors = require('cors');

require('dotenv').config();
const { validateStartupEnv } = require('./config/env');
validateStartupEnv();

const { firewallMiddleware, firewallAdminRouter } = require('./middleware/firewall');

const app = express();
const allowedOrigins = (process.env.CLIENT_URLS || process.env.FRONTEND_URL || 'http://localhost:5500')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('CORS policy blocked this origin'));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());

// ── FIREWALL — applied to every request ───────────────────────
//app.use(firewallMiddleware);

// ── ROUTES ────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/exchange',     require('./routes/exchange'));
app.use('/api/alerts',       require('./routes/alerts_route'));
app.use('/api/holdings',     require('./routes/holdings_route'));
app.use('/api/transactions', require('./routes/transactions_route'));
app.use('/api/wallet',       require('./routes/wallet_route'));
app.use('/api/watchlist',    require('./routes/watchlist_route'));
app.use('/api/news',         require('./routes/news_route')); // news feed + newsletter subscribe
app.use('/api/profile',     require('./routes/profile_route'));
app.use('/api/market',      require('./routes/market_route'));

// ── FIREWALL ADMIN (protected by x-admin-secret header) ───────
app.use('/api/firewall', firewallAdminRouter());

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        success:  true,
        message:  '🚀 Crypto Portfolio API is running!',
        firewall: '🔒 Active',
        endpoints: {
            register:          'POST   /api/auth/register',
            login:             'POST   /api/auth/login',
            me:                'GET    /api/auth/me',
            updateProfile:     'PUT    /api/auth/profile',
            changePassword:    'PUT    /api/auth/change-password',
            forgotPassword:    'POST   /api/auth/forgot-password',
            resetPassword:     'POST   /api/auth/reset-password',
            connectExchange:   'POST   /api/exchange/connect',
            getPortfolio:      'GET    /api/exchange/portfolio',
            listExchanges:     'GET    /api/exchange/list',
            deleteExchange:    'DELETE /api/exchange/:exchange',
            getAlerts:         'GET    /api/alerts',
            createAlert:       'POST   /api/alerts',
            deleteAlert:       'DELETE /api/alerts/:id',
            updateAlertStatus: 'PATCH  /api/alerts/:id/status',
            getHoldings:       'GET    /api/holdings',
            buyHolding:        'POST   /api/holdings/buy',
            sellHolding:       'POST   /api/holdings/sell',
            deleteHolding:     'DELETE /api/holdings/:coin_id',
            getTransactions:   'GET    /api/transactions',
            getWallet:         'GET    /api/wallet',
            deposit:           'POST   /api/wallet/deposit',
            withdraw:          'POST   /api/wallet/withdraw',
            addBank:           'POST   /api/wallet/bank',
            deleteBank:        'DELETE /api/wallet/bank/:id',
            marketSimplePrice: 'GET    /api/market/simple/price',
            marketGlobal:      'GET    /api/market/global',
            marketCoins:       'GET    /api/market/coins/markets',
            firewallStatus:    'GET    /api/firewall/status    [x-admin-secret required]',
            firewallBlock:     'POST   /api/firewall/block     [x-admin-secret required]',
            firewallUnblock:   'POST   /api/firewall/unblock   [x-admin-secret required]',
            firewallWhitelist: 'POST   /api/firewall/whitelist [x-admin-secret required]',
        }
    });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅  Server running on port ${PORT}`);
    console.log(`🔒  Firewall active — rate limiting, brute-force & IP rules enabled`);
});
