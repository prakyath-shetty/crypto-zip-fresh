// ============================================================
//  api.js — Frontend ↔ Backend Connector
//  Drop this file into your frontend at: /js/api.js
//  Then add to every HTML page:  <script src="/js/api.js"></script>
//
//  Backend: https://crypto-backend-d9v8.onrender.com
//  Frontend: https://crypto-frontend-app-six.vercel.app
// ============================================================

const API_BASE = 'https://crypto-backend-d9v8.onrender.com';

// ── TOKEN / SESSION HELPERS ───────────────────────────────────
const Auth = {
    getToken:    ()    => localStorage.getItem('token'),
    setToken:    (t)   => localStorage.setItem('token', t),
    getUser:     ()    => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
    setUser:     (u)   => localStorage.setItem('user', JSON.stringify(u)),
    isLoggedIn:  ()    => !!localStorage.getItem('token'),
    saveSession: (data) => {
        if (data.token) localStorage.setItem('token', data.token);
        if (data.user)  localStorage.setItem('user', JSON.stringify(data.user));
    },
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/pages/login.html';
    }
};

// ── CORE FETCH WRAPPER ────────────────────────────────────────
async function apiFetch(path, options = {}) {
    const token = Auth.getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };
    try {
        const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const data = await res.json();
        if (res.status === 401) { Auth.logout(); return data; }
        return data;
    } catch (err) {
        console.error(`API error [${path}]:`, err);
        return { success: false, message: 'Network error. Please check your connection.' };
    }
}

// ════════════════════════════════════════════════════════════
//  AUTH  — /api/auth/*
// ════════════════════════════════════════════════════════════
const AuthAPI = {

    // POST /api/auth/register
    register: (name, email, password) =>
        apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        }),

    // POST /api/auth/login
    login: (email, password) =>
        apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        }),

    // GET /api/auth/me
    me: () => apiFetch('/api/auth/me'),

    // PUT /api/auth/profile
    updateProfile: (name, phone, bio) =>
        apiFetch('/api/auth/profile', {
            method: 'PUT',
            body: JSON.stringify({ name, phone, bio })
        }),

    // PUT /api/auth/change-password
    changePassword: (currentPassword, newPassword) =>
        apiFetch('/api/auth/change-password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        }),

    // POST /api/auth/forgot-password  (passes frontend URL for reset email link)
    forgotPassword: (email) =>
        apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({
                email,
                frontendUrl: 'https://crypto-frontend-app-six.vercel.app'
            })
        }),

    // POST /api/auth/reset-password
    resetPassword: (token, password) =>
        apiFetch('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        }),

    // POST /api/auth/google-login  (after Google OAuth via Supabase)
    googleLogin: (name, email) =>
        apiFetch('/api/auth/google-login', {
            method: 'POST',
            body: JSON.stringify({ name, email })
        })
};

// ════════════════════════════════════════════════════════════
//  PROFILE  — /api/profile/*
// ════════════════════════════════════════════════════════════
const ProfileAPI = {

    // GET /api/profile
    get: () => apiFetch('/api/profile'),

    // PATCH /api/profile
    update: (name, phone, bio) =>
        apiFetch('/api/profile', {
            method: 'PATCH',
            body: JSON.stringify({ name, phone, bio })
        }),

    // PATCH /api/profile/password
    changePassword: (current_password, new_password) =>
        apiFetch('/api/profile/password', {
            method: 'PATCH',
            body: JSON.stringify({ current_password, new_password })
        }),

    // POST /api/profile/deactivate
    deactivate: () =>
        apiFetch('/api/profile/deactivate', { method: 'POST' }),

    // DELETE /api/profile/delete-account
    deleteAccount: () =>
        apiFetch('/api/profile/delete-account', { method: 'DELETE' }),

    // POST /api/profile/revoke-sessions
    revokeSessions: () =>
        apiFetch('/api/profile/revoke-sessions', { method: 'POST' })
};

// ════════════════════════════════════════════════════════════
//  HOLDINGS  — /api/holdings/*
// ════════════════════════════════════════════════════════════
const HoldingsAPI = {

    // GET /api/holdings
    get: () => apiFetch('/api/holdings'),

    // POST /api/holdings/buy
    buy: ({ coin_id, coin_name, symbol, amount, buy_price, icon, icon_color, icon_bg }) =>
        apiFetch('/api/holdings/buy', {
            method: 'POST',
            body: JSON.stringify({ coin_id, coin_name, symbol, amount, buy_price, icon, icon_color, icon_bg })
        }),

    // POST /api/holdings/sell
    sell: ({ coin_id, symbol, amount, sell_price }) =>
        apiFetch('/api/holdings/sell', {
            method: 'POST',
            body: JSON.stringify({ coin_id, symbol, amount, sell_price })
        }),

    // DELETE /api/holdings/:coin_id
    delete: (coin_id) =>
        apiFetch(`/api/holdings/${encodeURIComponent(coin_id)}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  WALLET  — /api/wallet/*
// ════════════════════════════════════════════════════════════
const WalletAPI = {

    // GET /api/wallet
    get: () => apiFetch('/api/wallet'),

    // POST /api/wallet/deposit
    deposit: (amount, note = 'Wallet deposit') =>
        apiFetch('/api/wallet/deposit', {
            method: 'POST',
            body: JSON.stringify({ amount, note })
        }),

    // POST /api/wallet/withdraw
    withdraw: (amount, note = 'Wallet withdrawal') =>
        apiFetch('/api/wallet/withdraw', {
            method: 'POST',
            body: JSON.stringify({ amount, note })
        }),

    // POST /api/wallet/bank
    addBank: ({ bank_name, account_number, ifsc, account_type }) =>
        apiFetch('/api/wallet/bank', {
            method: 'POST',
            body: JSON.stringify({ bank_name, account_number, ifsc, account_type })
        }),

    // DELETE /api/wallet/bank/:id
    deleteBank: (id) =>
        apiFetch(`/api/wallet/bank/${id}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  TRANSACTIONS  — /api/transactions
// ════════════════════════════════════════════════════════════
const TransactionsAPI = {

    // GET /api/transactions?type=all&limit=50
    get: ({ type = 'all', limit } = {}) => {
        let qs = `?type=${type}`;
        if (limit) qs += `&limit=${limit}`;
        return apiFetch(`/api/transactions${qs}`);
    }
};

// ════════════════════════════════════════════════════════════
//  WATCHLIST  — /api/watchlist/*
// ════════════════════════════════════════════════════════════
const WatchlistAPI = {

    // GET /api/watchlist
    get: () => apiFetch('/api/watchlist'),

    // POST /api/watchlist
    add: (coin_id, symbol, name) =>
        apiFetch('/api/watchlist', {
            method: 'POST',
            body: JSON.stringify({ coin_id, symbol, name })
        }),

    // DELETE /api/watchlist/:coin_id
    remove: (coin_id) =>
        apiFetch(`/api/watchlist/${encodeURIComponent(coin_id)}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  ALERTS  — /api/alerts/*
// ════════════════════════════════════════════════════════════
const AlertsAPI = {

    // GET /api/alerts
    get: () => apiFetch('/api/alerts'),

    // GET /api/alerts/prices?ids=bitcoin,ethereum,...
    getPrices: (coinIds) =>
        apiFetch(`/api/alerts/prices?ids=${coinIds.join(',')}`),

    // POST /api/alerts
    create: ({ coin_id, coin_name, symbol, condition, target_price, note }) =>
        apiFetch('/api/alerts', {
            method: 'POST',
            body: JSON.stringify({ coin_id, coin_name, symbol, condition, target_price, note })
        }),

    // PATCH /api/alerts/:id/status
    updateStatus: (id, status) =>
        apiFetch(`/api/alerts/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        }),

    // DELETE /api/alerts/:id
    delete: (id) =>
        apiFetch(`/api/alerts/${id}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  NEWS  — /api/news/*
// ════════════════════════════════════════════════════════════
const NewsAPI = {

    // GET /api/news/feed  (public, no auth needed)
    feed: () => apiFetch('/api/news/feed'),

    // POST /api/news/subscribe  (requires auth)
    subscribe: (email) =>
        apiFetch('/api/news/subscribe', {
            method: 'POST',
            body: JSON.stringify({ email })
        })
};

// ════════════════════════════════════════════════════════════
//  EXCHANGE  — /api/exchange/*
// ════════════════════════════════════════════════════════════
const ExchangeAPI = {

    // POST /api/exchange/connect
    connect: ({ exchange, apiKey, apiSecret, passphrase }) =>
        apiFetch('/api/exchange/connect', {
            method: 'POST',
            body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase })
        }),

    // GET /api/exchange/portfolio?exchange=binance
    portfolio: (exchange = null) => {
        const qs = exchange ? `?exchange=${exchange}` : '';
        return apiFetch(`/api/exchange/portfolio${qs}`);
    },

    // GET /api/exchange/list
    list: () => apiFetch('/api/exchange/list'),

    // DELETE /api/exchange/:exchange
    delete: (exchange) =>
        apiFetch(`/api/exchange/${exchange}`, { method: 'DELETE' }),

    // POST /api/exchange/sync-trades
    syncTrades: (exchange) =>
        apiFetch('/api/exchange/sync-trades', {
            method: 'POST',
            body: JSON.stringify({ exchange })
        })
};

// ════════════════════════════════════════════════════════════
//  USAGE EXAMPLES
// ════════════════════════════════════════════════════════════
//
//  LOGIN:
//    const res = await AuthAPI.login(email, password);
//    if (res.success) { Auth.saveSession(res); window.location.href = '/pages/dashboard.html'; }
//
//  GET HOLDINGS:
//    const res = await HoldingsAPI.get();
//    if (res.success) renderHoldings(res.holdings);
//
//  BUY COIN:
//    const res = await HoldingsAPI.buy({ coin_id: 'bitcoin', coin_name: 'Bitcoin', symbol: 'BTC', amount: 0.01, buy_price: 65000 });
//
//  GET WALLET:
//    const res = await WalletAPI.get();
//    if (res.success) showBalance(res.balance);
//
//  ADD ALERT:
//    const res = await AlertsAPI.create({ coin_id: 'bitcoin', coin_name: 'Bitcoin', symbol: 'BTC', condition: 'above', target_price: 70000 });
//
//  CHECK LIVE PRICES + TRIGGER ALERTS (call every 60s):
//    const res = await AlertsAPI.getPrices(['bitcoin', 'ethereum', 'solana']);
//    if (res.triggered?.length) showNotification('Alert triggered!');
//
//  NEWS FEED:
//    const res = await NewsAPI.feed();
//    if (res.success) renderArticles(res.articles);
//
//  LOGOUT:
//    Auth.logout();  // clears localStorage and redirects to login
