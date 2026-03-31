const express = require('express');
const router = express.Router();
const db = require('../db');
const { protect } = require('../middleware/auth');

// GET /api/wallet — get balance + bank accounts
router.get('/', protect, async (req, res) => {
    try {
        // Get or create wallet
        let wallet = await db.query('SELECT * FROM wallets WHERE user_id = $1', [req.user.id]);
        if (wallet.rows.length === 0) {
            wallet = await db.query(
                'INSERT INTO wallets (user_id, balance) VALUES ($1, 10000) RETURNING *',
                [req.user.id]
            );
        }
        const banks = await db.query('SELECT * FROM bank_accounts WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, balance: parseFloat(wallet.rows[0].balance), banks: banks.rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/wallet/deposit
router.post('/deposit', protect, async (req, res) => {
    const { amount, note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    try {
        // Upsert wallet
        await db.query(`
            INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()
        `, [req.user.id, amount]);

        // Record transaction
        await db.query(`
            INSERT INTO transactions (user_id, type, amount, note)
            VALUES ($1, 'deposit', $2, $3)
        `, [req.user.id, amount, note || 'Wallet deposit']);

        const wallet = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, balance: parseFloat(wallet.rows[0].balance), message: 'Deposit successful' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/wallet/withdraw
router.post('/withdraw', protect, async (req, res) => {
    const { amount, note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    try {
        const wallet = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
        if (!wallet.rows.length || parseFloat(wallet.rows[0].balance) < amount)
            return res.status(400).json({ success: false, message: 'Insufficient balance' });

        await db.query(`
            UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2
        `, [amount, req.user.id]);

        await db.query(`
            INSERT INTO transactions (user_id, type, amount, note)
            VALUES ($1, 'withdraw', $2, $3)
        `, [req.user.id, amount, note || 'Wallet withdrawal']);

        const updated = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, balance: parseFloat(updated.rows[0].balance), message: 'Withdrawal successful' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/wallet/bank — add bank account
router.post('/bank', protect, async (req, res) => {
    const { bank_name, account_number, ifsc, account_type } = req.body;
    if (!bank_name || !account_number) return res.status(400).json({ success: false, message: 'Bank name and account number required' });
    try {
        const masked = '••••' + account_number.slice(-4);
        const result = await db.query(`
            INSERT INTO bank_accounts (user_id, bank_name, account_number, masked_number, ifsc, account_type)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [req.user.id, bank_name, account_number, masked, ifsc || '', account_type || 'savings']);
        res.json({ success: true, bank: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// DELETE /api/wallet/bank/:id
router.delete('/bank/:id', protect, async (req, res) => {
    try {
        await db.query('DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true, message: 'Bank account removed' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
