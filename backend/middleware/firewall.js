// ============================================================
//  CryptoTrack — Backend Firewall Middleware
//  Covers: Rate Limiting · Brute-Force · IP Whitelist/Blacklist
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── CONFIG ────────────────────────────────────────────────────
const CONFIG = {

    rateLimit: {
        global:   { windowMs: 60_000,        maxRequests: 120 },
        auth:     { windowMs: 15 * 60_000,   maxRequests: 20  },  // 20 attempts / 15 min
        api:      { windowMs: 60_000,        maxRequests: 60  },  // 60 calls / min
        exchange: { windowMs: 60_000,        maxRequests: 10  },  // 10 connects / min
    },

    bruteForce: {
        maxFailedAttempts:  5,
        lockoutDurationMs:  15 * 60_000,   // 15 min base lockout
        progressivePenalty: true,          // +5 min per extra failure after lock
    },

    ip: {
        // Comma-separated in .env — e.g. FIREWALL_WHITELIST=127.0.0.1,192.168.1.1
        whitelist: (process.env.FIREWALL_WHITELIST || '127.0.0.1,::1,::ffff:127.0.0.1')
            .split(',').map(s => s.trim()).filter(Boolean),
        blacklist: (process.env.FIREWALL_BLACKLIST || '')
            .split(',').map(s => s.trim()).filter(Boolean),
        autoBlockThreshold:  10,            // violations before auto-block
        autoBlockDurationMs: 60 * 60_000,   // auto-block for 1 hour
    },

    logFile:      process.env.FIREWALL_LOG || path.join(__dirname, '../logs/firewall.log'),
    logToConsole: process.env.NODE_ENV !== 'production',
};

// ── IN-MEMORY STORES (swap for Redis in production) ───────────
const rateLimitStore  = new Map();   // "ip::route" → { count, resetAt }
const bruteForceStore = new Map();   // "ip::route" → { failures, lockedUntil }
const violationStore  = new Map();   // ip → violation count
const autoBlockStore  = new Map();   // ip → blockedUntil timestamp

// ── HELPERS ───────────────────────────────────────────────────

function getClientIP(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        req.ip || 'unknown'
    );
}

function ensureLogDir() {
    const dir = path.dirname(CONFIG.logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(level, ip, event, detail = '') {
    const ts   = new Date().toISOString();
    const line = `[${ts}] [${level}] IP=${ip} EVENT=${event}${detail ? ' | ' + detail : ''}\n`;
    if (CONFIG.logToConsole) {
        const c = level === 'BLOCK' ? '\x1b[31m' : level === 'WARN' ? '\x1b[33m' : '\x1b[36m';
        process.stdout.write(c + line + '\x1b[0m');
    }
    try { ensureLogDir(); fs.appendFileSync(CONFIG.logFile, line); } catch (_) {}
}

function blockRes(res, message, retryAfter = null) {
    res.set('X-Firewall', 'blocked');
    if (retryAfter) res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
        success: false, error: 'firewall', message,
        ...(retryAfter ? { retryAfter } : {})
    });
}

// ── RATE LIMITER ──────────────────────────────────────────────

function getRuleFor(path) {
    if (/^\/api\/auth/.test(path))              return CONFIG.rateLimit.auth;
    if (/^\/api\/exchange\/connect/.test(path)) return CONFIG.rateLimit.exchange;
    if (/^\/api\//.test(path))                  return CONFIG.rateLimit.api;
    return CONFIG.rateLimit.global;
}

function checkRateLimit(ip, path) {
    const rule = getRuleFor(path);
    const key  = `${ip}::${path.split('/').slice(0, 4).join('/')}`;
    const now  = Date.now();
    let   e    = rateLimitStore.get(key);

    if (!e || now > e.resetAt) {
        e = { count: 0, resetAt: now + rule.windowMs };
        rateLimitStore.set(key, e);
    }
    e.count++;

    if (e.count > rule.maxRequests) {
        // Count violation toward auto-block
        const v = (violationStore.get(ip) || 0) + 1;
        violationStore.set(ip, v);
        if (v >= CONFIG.ip.autoBlockThreshold) {
            autoBlockStore.set(ip, now + CONFIG.ip.autoBlockDurationMs);
            log('BLOCK', ip, 'AUTO_BLOCKED', `violations=${v}`);
        }
        return { blocked: true, retryAfter: Math.ceil((e.resetAt - now) / 1000), remaining: 0 };
    }

    return { blocked: false, remaining: rule.maxRequests - e.count };
}

// ── BRUTE-FORCE GUARD ─────────────────────────────────────────

const BRUTE_PATHS = [
    '/api/auth/login',
    '/api/auth/forgot-password',
    '/api/exchange/connect',
];

function bruteKey(ip, path) {
    const base = BRUTE_PATHS.find(p => path.startsWith(p)) || path;
    return `${ip}::${base}`;
}

function recordFailedAttempt(ip, path) {
    const key = bruteKey(ip, path);
    const now = Date.now();
    let   e   = bruteForceStore.get(key) || { failures: 0, lockedUntil: 0 };

    e.failures++;

    if (e.failures >= CONFIG.bruteForce.maxFailedAttempts) {
        const extra   = e.failures - CONFIG.bruteForce.maxFailedAttempts;
        const penalty = CONFIG.bruteForce.lockoutDurationMs +
            (CONFIG.bruteForce.progressivePenalty ? extra * 5 * 60_000 : 0);
        e.lockedUntil = now + penalty;
        log('BLOCK', ip, 'BRUTE_LOCKOUT', `failures=${e.failures} path=${path} locked=${Math.round(penalty/60000)}min`);
    } else {
        log('WARN', ip, 'FAILED_ATTEMPT', `failures=${e.failures} path=${path}`);
    }

    bruteForceStore.set(key, e);
    return e;
}

function checkBruteForce(ip, path) {
    if (!BRUTE_PATHS.some(p => path.startsWith(p))) return { locked: false };
    const e = bruteForceStore.get(bruteKey(ip, path));
    if (!e || !e.lockedUntil) return { locked: false };
    const now = Date.now();
    if (now < e.lockedUntil) {
        return { locked: true, retryAfter: Math.ceil((e.lockedUntil - now) / 1000), failures: e.failures };
    }
    bruteForceStore.delete(bruteKey(ip, path));  // expired — clear
    return { locked: false };
}

// ── IP GUARD ──────────────────────────────────────────────────

function checkIP(ip) {
    if (CONFIG.ip.whitelist.includes(ip))
        return { allowed: true, whitelisted: true };

    if (CONFIG.ip.blacklist.includes(ip)) {
        log('BLOCK', ip, 'BLACKLISTED');
        return { allowed: false, reason: 'Your IP address has been blocked.' };
    }

    const blockedUntil = autoBlockStore.get(ip);
    if (blockedUntil && Date.now() < blockedUntil) {
        const retryAfter = Math.ceil((blockedUntil - Date.now()) / 1000);
        return { allowed: false, reason: 'Too many violations. Your IP is temporarily blocked.', retryAfter };
    }

    return { allowed: true };
}

// ── MAIN MIDDLEWARE ───────────────────────────────────────────

function firewallMiddleware(req, res, next) {
    const ip   = getClientIP(req);
    const path = req.path;

    // Expose helpers to route handlers
    res.locals.firewall = {
        ip,
        recordFailedAttempt: () => recordFailedAttempt(ip, path),
        clearAttempts:        () => bruteForceStore.delete(bruteKey(ip, path)),
    };

    // 1 — IP check
    const ipCheck = checkIP(ip);
    if (!ipCheck.allowed) return blockRes(res, ipCheck.reason, ipCheck.retryAfter);
    if (ipCheck.whitelisted) return next();   // whitelisted IPs skip rate limits

    // 2 — Brute-force pre-check
    const bf = checkBruteForce(ip, path);
    if (bf.locked) {
        log('BLOCK', ip, 'BRUTE_BLOCKED', `path=${path} retryAfter=${bf.retryAfter}s`);
        return blockRes(
            res,
            `Too many failed attempts. Try again in ${Math.ceil(bf.retryAfter / 60)} minute(s).`,
            bf.retryAfter
        );
    }

    // 3 — Rate limit
    const rl = checkRateLimit(ip, path);
    if (rl.blocked) {
        log('WARN', ip, 'RATE_LIMITED', `path=${path} retryAfter=${rl.retryAfter}s`);
        return blockRes(res, 'Too many requests. Please slow down.', rl.retryAfter);
    }

    res.set('X-RateLimit-Remaining', String(rl.remaining));
    next();
}

// ── ADMIN ROUTER ─────────────────────────────────────────────
// Mount at /api/firewall — protect with FIREWALL_ADMIN_SECRET header

function firewallAdminRouter() {
    const router = require('express').Router();
    const secret = process.env.FIREWALL_ADMIN_SECRET;

    // Auth guard
    router.use((req, res, next) => {
        if (!secret)
            return res.status(503).json({ message: 'Set FIREWALL_ADMIN_SECRET in .env to use admin endpoints' });
        if (req.headers['x-admin-secret'] !== secret)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        next();
    });

    // GET /api/firewall/status
    router.get('/status', (_req, res) => {
        res.json({
            success: true,
            rateLimitedEntries: rateLimitStore.size,
            bruteForceEntries:  bruteForceStore.size,
            autoBlockedIPs:     [...autoBlockStore.entries()].map(([ip, until]) => ({
                ip, blockedUntil: new Date(until).toISOString(),
                remainingSec: Math.max(0, Math.ceil((until - Date.now()) / 1000))
            })),
            blacklistedIPs:  CONFIG.ip.blacklist,
            whitelistedIPs:  CONFIG.ip.whitelist,
        });
    });

    // POST /api/firewall/block  — body: { ip }
    router.post('/block', (req, res) => {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ message: 'ip required' });
        if (!CONFIG.ip.blacklist.includes(ip)) CONFIG.ip.blacklist.push(ip);
        log('BLOCK', ip, 'MANUAL_BLOCK');
        res.json({ success: true, message: `${ip} permanently blacklisted` });
    });

    // POST /api/firewall/unblock  — body: { ip }
    router.post('/unblock', (req, res) => {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ message: 'ip required' });
        CONFIG.ip.blacklist = CONFIG.ip.blacklist.filter(x => x !== ip);
        autoBlockStore.delete(ip);
        violationStore.delete(ip);
        bruteForceStore.forEach((_, k) => { if (k.startsWith(ip + '::')) bruteForceStore.delete(k); });
        log('INFO', ip, 'MANUAL_UNBLOCK');
        res.json({ success: true, message: `${ip} unblocked` });
    });

    // POST /api/firewall/whitelist  — body: { ip }
    router.post('/whitelist', (req, res) => {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ message: 'ip required' });
        if (!CONFIG.ip.whitelist.includes(ip)) CONFIG.ip.whitelist.push(ip);
        log('INFO', ip, 'MANUAL_WHITELIST');
        res.json({ success: true, message: `${ip} whitelisted` });
    });

    // DELETE /api/firewall/whitelist  — body: { ip }
    router.delete('/whitelist', (req, res) => {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ message: 'ip required' });
        CONFIG.ip.whitelist = CONFIG.ip.whitelist.filter(x => x !== ip);
        res.json({ success: true, message: `${ip} removed from whitelist` });
    });

    return router;
}

module.exports = { firewallMiddleware, firewallAdminRouter, recordFailedAttempt };
