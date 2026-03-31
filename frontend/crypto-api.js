// ============================================================
//  crypto-api.js — Frontend ↔ Backend Connector
//  Backend: https://crypto-backend-d9v8.onrender.com
//  Frontend: https://crypto-frontend-app-six.vercel.app
// ============================================================

const API_BASE = 'https://crypto-backend-d9v8.onrender.com';

// ── TOKEN / SESSION HELPERS ───────────────────────────────────
const Auth = {
    getToken:    ()     => localStorage.getItem('token'),
    setToken:    (t)    => localStorage.setItem('token', t),
    getUser:     ()     => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
    setUser:     (u)    => localStorage.setItem('user', JSON.stringify(u)),
    isLoggedIn:  ()     => !!localStorage.getItem('token'),
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
// FIX 1: Now attaches Bearer token on every request
// FIX 2: Returns parsed JSON (not raw Response)
// FIX 3: Auto-logout on 401, network error returns {success:false}
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
        if (res.status === 401) {
            Auth.logout();
            return data;
        }
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

    register: (name, email, password) =>
        apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        }),

    login: (email, password) =>
        apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        }),

    me: () => apiFetch('/api/auth/me'),

    updateProfile: (name, phone, bio) =>
        apiFetch('/api/profile', {
            method: 'PATCH',
            body: JSON.stringify({ name, phone, bio })
        }),

    changePassword: (currentPassword, newPassword) =>
        apiFetch('/api/profile/password', {
            method: 'PATCH',
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        }),

    forgotPassword: (email) =>
        apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({
                email,
                frontendUrl: 'https://crypto-frontend-app-six.vercel.app'
            })
        }),

    resetPassword: (token, password) =>
        apiFetch('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        }),

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

    get: () => apiFetch('/api/profile'),

    update: (name, phone, bio) =>
        apiFetch('/api/profile', {
            method: 'PATCH',
            body: JSON.stringify({ name, phone, bio })
        }),

    changePassword: (current_password, new_password) =>
        apiFetch('/api/profile/password', {
            method: 'PATCH',
            body: JSON.stringify({ current_password, new_password })
        }),

    deactivate: () =>
        apiFetch('/api/profile/deactivate', { method: 'POST' }),

    deleteAccount: () =>
        apiFetch('/api/profile/delete-account', { method: 'DELETE' }),

    revokeSessions: () =>
        apiFetch('/api/profile/revoke-sessions', { method: 'POST' })
};

// ════════════════════════════════════════════════════════════
//  HOLDINGS  — /api/holdings/*
// ════════════════════════════════════════════════════════════
const HoldingsAPI = {

    get: () => apiFetch('/api/holdings'),

    buy: ({ coin_id, coin_name, symbol, amount, buy_price, icon, icon_color, icon_bg }) =>
        apiFetch('/api/holdings/buy', {
            method: 'POST',
            body: JSON.stringify({ coin_id, coin_name, symbol, amount, buy_price, icon, icon_color, icon_bg })
        }),

    sell: ({ coin_id, symbol, amount, sell_price }) =>
        apiFetch('/api/holdings/sell', {
            method: 'POST',
            body: JSON.stringify({ coin_id, symbol, amount, sell_price })
        }),

    delete: (coin_id) =>
        apiFetch(`/api/holdings/${encodeURIComponent(coin_id)}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  WALLET  — /api/wallet/*
// ════════════════════════════════════════════════════════════
const WalletAPI = {

    get: () => apiFetch('/api/wallet'),

    deposit: (amount, note = 'Wallet deposit') =>
        apiFetch('/api/wallet/deposit', {
            method: 'POST',
            body: JSON.stringify({ amount, note })
        }),

    withdraw: (amount, note = 'Wallet withdrawal') =>
        apiFetch('/api/wallet/withdraw', {
            method: 'POST',
            body: JSON.stringify({ amount, note })
        }),

    addBank: ({ bank_name, account_number, ifsc, account_type }) =>
        apiFetch('/api/wallet/bank', {
            method: 'POST',
            body: JSON.stringify({ bank_name, account_number, ifsc, account_type })
        }),

    deleteBank: (id) =>
        apiFetch(`/api/wallet/bank/${id}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  TRANSACTIONS  — /api/transactions
// ════════════════════════════════════════════════════════════
const TransactionsAPI = {

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

    get: () => apiFetch('/api/watchlist'),

    add: (coin_id, symbol, name) =>
        apiFetch('/api/watchlist', {
            method: 'POST',
            body: JSON.stringify({ coin_id, symbol, name })
        }),

    remove: (coin_id) =>
        apiFetch(`/api/watchlist/${encodeURIComponent(coin_id)}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  ALERTS  — /api/alerts/*
// ════════════════════════════════════════════════════════════
const AlertsAPI = {

    get: () => apiFetch('/api/alerts'),

    getPrices: (coinIds) =>
        apiFetch(`/api/alerts/prices?ids=${coinIds.join(',')}`),

    create: ({ coin_id, coin_name, symbol, condition, target_price, note }) =>
        apiFetch('/api/alerts', {
            method: 'POST',
            body: JSON.stringify({ coin_id, coin_name, symbol, condition, target_price, note })
        }),

    updateStatus: (id, status) =>
        apiFetch(`/api/alerts/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        }),

    delete: (id) =>
        apiFetch(`/api/alerts/${id}`, { method: 'DELETE' })
};

// ════════════════════════════════════════════════════════════
//  NEWS  — /api/news/*
// ════════════════════════════════════════════════════════════
const NewsAPI = {

    feed: () => apiFetch('/api/news/feed'),

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

    connect: ({ exchange, apiKey, apiSecret, passphrase }) =>
        apiFetch('/api/exchange/connect', {
            method: 'POST',
            body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase })
        }),

    portfolio: (exchange = null) => {
        const qs = exchange ? `?exchange=${exchange}` : '';
        return apiFetch(`/api/exchange/portfolio${qs}`);
    },

    list: () => apiFetch('/api/exchange/list'),

    delete: (exchange) =>
        apiFetch(`/api/exchange/${exchange}`, { method: 'DELETE' }),

    syncTrades: (exchange) =>
        apiFetch('/api/exchange/sync-trades', {
            method: 'POST',
            body: JSON.stringify({ exchange })
        })
};
