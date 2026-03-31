// ============================================================
//  CryptoTrack — Frontend Firewall Client
//  Drop this ONE <script> tag into every HTML page:
//  <script src="firewall.client.js"></script>
//
//  Covers:
//   • Intercepts all fetch() calls — handles 429 / firewall responses
//   • Client-side rate limiting  — stops hammering the backend
//   • Login brute-force guard    — locks the UI after X failures
//   • Suspicious behaviour flags — detects rapid form resubmits
//   • Firewall toast             — shows user-friendly messages
// ============================================================

(function () {
    'use strict';

    // ── CONFIG ──────────────────────────────────────────────────
    const CFG = {
        // Client-side rate limit — show warning before backend blocks
        clientRateLimit: {
            windowMs:    10_000,   // 10 second window
            maxRequests: 15,       // warn if >15 requests in 10s
        },
        // Login brute-force guard
        bruteForce: {
            maxFailures:         5,
            lockoutMs:           15 * 60_000,   // 15 min
            storageKey:          'fw_bf',
            progressivePenalty:  true,
        },
        // Suspicious rapid form submission
        formGuard: {
            minSubmitIntervalMs: 800,   // flag if form submitted < 800ms after last
        },
        toast: {
            durationMs: 5_000,
        },
    };

    // Auth paths that count toward brute-force
    const BRUTE_PATHS = ['/api/auth/login', '/api/auth/forgot-password', '/api/exchange/connect'];

    // ── STATE ────────────────────────────────────────────────────
    let requestTimestamps = [];   // for client-side rate limit
    let lastFormSubmit    = 0;    // for form submission guard

    // ── TOAST UI ─────────────────────────────────────────────────

    function showToast(message, type = 'warn') {
        // Remove existing toast
        document.getElementById('fw-toast')?.remove();

        const colours = {
            warn:    { bg: 'rgba(255,77,109,0.95)',  border: '#ff4d6d', icon: '🛡️' },
            info:    { bg: 'rgba(0,229,255,0.12)',   border: '#00e5ff', icon: '🔒' },
            success: { bg: 'rgba(0,255,156,0.12)',   border: '#00ff9c', icon: '✅' },
        };
        const c = colours[type] || colours.warn;

        const el = document.createElement('div');
        el.id = 'fw-toast';
        el.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:99999;
            background:${c.bg}; border:1px solid ${c.border};
            border-radius:12px; padding:14px 18px;
            display:flex; align-items:center; gap:12px;
            font-family:'Inter',sans-serif; font-size:13px;
            color:#e0f0ff; max-width:360px;
            box-shadow:0 8px 32px rgba(0,0,0,0.5);
            animation:fwSlideIn 0.3s ease;
        `;

        // Inject keyframes once
        if (!document.getElementById('fw-styles')) {
            const s = document.createElement('style');
            s.id = 'fw-styles';
            s.textContent = `
                @keyframes fwSlideIn  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
                @keyframes fwSlideOut { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(12px)} }
                #fw-countdown-bar { transition: width linear; }
            `;
            document.head.appendChild(s);
        }

        el.innerHTML = `
            <span style="font-size:20px">${c.icon}</span>
            <div style="flex:1">
                <div style="font-weight:600;margin-bottom:2px">Firewall</div>
                <div style="opacity:0.85;line-height:1.4">${message}</div>
            </div>
            <button onclick="this.parentNode.remove()" style="background:none;border:none;color:#4a7090;font-size:18px;cursor:pointer;padding:0;line-height:1">✕</button>
        `;

        document.body.appendChild(el);
        setTimeout(() => {
            if (el.parentNode) {
                el.style.animation = 'fwSlideOut 0.3s ease forwards';
                setTimeout(() => el.remove(), 300);
            }
        }, CFG.toast.durationMs);
    }

    // ── BRUTE-FORCE STORE (localStorage) ────────────────────────

    function getBFState() {
        try { return JSON.parse(localStorage.getItem(CFG.bruteForce.storageKey) || '{}'); }
        catch (_) { return {}; }
    }
    function saveBFState(s) {
        try { localStorage.setItem(CFG.bruteForce.storageKey, JSON.stringify(s)); } catch (_) {}
    }

    function recordClientFailure(url) {
        if (!BRUTE_PATHS.some(p => url.includes(p))) return;
        const s   = getBFState();
        const key = BRUTE_PATHS.find(p => url.includes(p)) || url;
        const e   = s[key] || { failures: 0, lockedUntil: 0 };
        e.failures++;

        if (e.failures >= CFG.bruteForce.maxFailures) {
            const extra   = e.failures - CFG.bruteForce.maxFailures;
            const penalty = CFG.bruteForce.lockoutMs +
                (CFG.bruteForce.progressivePenalty ? extra * 5 * 60_000 : 0);
            e.lockedUntil = Date.now() + penalty;
            showToast(`Too many failed attempts. UI locked for ${Math.round(penalty / 60_000)} min.`, 'warn');
        }

        s[key] = e;
        saveBFState(s);
    }

    function clearClientFailures(url) {
        const s   = getBFState();
        const key = BRUTE_PATHS.find(p => url.includes(p));
        if (key) { delete s[key]; saveBFState(s); }
    }

    function isClientLocked(url) {
        const s   = getBFState();
        const key = BRUTE_PATHS.find(p => url.includes(p));
        if (!key) return false;
        const e = s[key];
        if (!e?.lockedUntil) return false;
        if (Date.now() < e.lockedUntil) {
            const remaining = Math.ceil((e.lockedUntil - Date.now()) / 60_000);
            return { locked: true, remaining };
        }
        // Expired — clear
        delete s[key];
        saveBFState(s);
        return false;
    }

    // ── CLIENT-SIDE RATE LIMIT ───────────────────────────────────

    function checkClientRateLimit() {
        const now    = Date.now();
        const window = CFG.clientRateLimit.windowMs;
        requestTimestamps = requestTimestamps.filter(t => now - t < window);
        requestTimestamps.push(now);

        if (requestTimestamps.length > CFG.clientRateLimit.maxRequests) {
            showToast('You\'re sending requests very quickly. Slowing down to avoid being blocked.', 'warn');
            return false;  // caller can decide to delay/abort
        }
        return true;
    }

    // ── FETCH INTERCEPTOR ────────────────────────────────────────

    const _origFetch = window.fetch.bind(window);

    window.fetch = async function (input, init = {}) {
        const url    = typeof input === 'string' ? input : input?.url || '';
        const method = (init?.method || 'GET').toUpperCase();

        // Only intercept our own API calls
        const isOwnAPI = url.includes('/api/');
        if (!isOwnAPI) return _origFetch(input, init);

        // Check if client-side locked (brute force)
        const lock = isClientLocked(url);
        if (lock) {
            showToast(`Login locked. Try again in ${lock.remaining} minute(s).`, 'warn');
            return new Response(JSON.stringify({
                success: false, error: 'client_firewall',
                message: `Too many failed attempts. Try again in ${lock.remaining} minute(s).`
            }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }

        // Client-side rate limit check
        checkClientRateLimit();

        // Make the real request
        let response;
        try {
            response = await _origFetch(input, init);
        } catch (err) {
            throw err;
        }

        // Handle 429 from backend
        if (response.status === 429) {
            const clone = response.clone();
            try {
                const data = await clone.json();
                if (data.error === 'firewall') {
                    const retry = data.retryAfter
                        ? ` Try again in ${Math.ceil(data.retryAfter / 60)} minute(s).`
                        : '';
                    showToast((data.message || 'Request blocked by firewall.') + retry, 'warn');
                }
            } catch (_) {
                showToast('Too many requests — blocked by firewall.', 'warn');
            }
        }

        // Track failed auth attempts
        if (response.status === 401 || response.status === 403) {
            if (BRUTE_PATHS.some(p => url.includes(p))) {
                recordClientFailure(url);
            }
        }

        // Clear brute-force on successful auth
        if (response.ok && method === 'POST' && BRUTE_PATHS.some(p => url.includes(p))) {
            clearClientFailures(url);
        }

        return response;
    };

    // ── FORM SUBMISSION GUARD ─────────────────────────────────────
    // Flags suspiciously rapid form submissions (bot-like behaviour)

    document.addEventListener('submit', function (e) {
        const now = Date.now();
        if (lastFormSubmit && (now - lastFormSubmit) < CFG.formGuard.minSubmitIntervalMs) {
            e.preventDefault();
            e.stopImmediatePropagation();
            showToast('Slow down — that was too fast! Please wait a moment before submitting.', 'warn');
            return false;
        }
        lastFormSubmit = now;
    }, true);

    // ── EXPOSE PUBLIC API ─────────────────────────────────────────
    // Useful for your login page to show lockout state

    window.CryptoFirewall = {
        /**
         * Call this after a successful login to clear brute-force counters.
         */
        onLoginSuccess(url = '/api/auth/login') {
            clearClientFailures(url);
            showToast('Logged in securely.', 'success');
        },
        /**
         * Check if login UI should be disabled right now.
         * Returns { locked: false } or { locked: true, remaining: minutes }
         */
        isLoginLocked() {
            return isClientLocked('/api/auth/login') || { locked: false };
        },
        /**
         * Manually show a firewall toast from your own code.
         */
        showToast,
    };

    console.log('%c🔒 CryptoTrack Firewall active', 'color:#00e5ff;font-weight:bold;font-size:13px');

})();
