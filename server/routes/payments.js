// server/routes/payments.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const axios = require('axios');

// MPESA Integration Config (Replace with actual credentials)
const MPESA_CONFIG = {
    consumerKey: process.env.MPESA_CONSUMER_KEY || 'your_consumer_key',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || 'your_consumer_secret',
    passkey: process.env.MPESA_PASSKEY || 'your_passkey',
    shortcode: process.env.MPESA_SHORTCODE || '174379',
    callbackURL: process.env.MPESA_CALLBACK_URL || 'https://your-domain.com/api/payments/callback'
};

// Get all payments
router.get('/', async (req, res) => {
    try {
        const { month, year, status, member_id } = req.query;
        
        let query = `
            SELECT p.*, m.name as member_name, m.phone as member_phone
            FROM payments p
            JOIN members m ON p.member_id = m.id
            WHERE 1=1
        `;
        const params = [];

        if (month) {
            query += ' AND p.month = ?';
            params.push(month);
        }
        if (year) {
            query += ' AND p.year = ?';
            params.push(year);
        }
        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        }
        if (member_id) {
            query += ' AND p.member_id = ?';
            params.push(member_id);
        }

        query += ' ORDER BY p.date_paid DESC';

        const [rows] = await pool.query(query, params);
        
        res.json({
            message: "success",
            data: rows,
            count: rows.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get payment statistics
router.get('/stats', async (req, res) => {
    try {
        const [currentStats] = await pool.query(`
            SELECT 
                COUNT(DISTINCT member_id) as total_members,
                SUM(CASE WHEN status = 'paid' AND month = ? AND year = ? THEN 1 ELSE 0 END) as paid_members,
                SUM(CASE WHEN status = 'pending' AND month = ? AND year = ? THEN 1 ELSE 0 END) as pending_members,
                SUM(CASE WHEN status = 'overdue' AND month = ? AND year = ? THEN 1 ELSE 0 END) as overdue_members,
                SUM(CASE WHEN status = 'paid' AND month = ? AND year = ? THEN amount ELSE 0 END) as total_collected,
                (COUNT(DISTINCT member_id) * 600) as expected_total
            FROM payments
        `, ['January', '2026', 'January', '2026', 'January', '2026', 'January', '2026']);

        const [yearlyStats] = await pool.query(`
            SELECT 
                SUM(amount) as yearly_total,
                AVG(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) * 100 as collection_rate,
                SUM(penalty_amount) as total_penalties
            FROM payments
            WHERE year = ?
        `, ['2026']);

        res.json({
            ...currentStats[0],
            ...yearlyStats[0],
            month: 'January',
            year: '2026'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Initiate MPESA Payment
router.post('/initiate', async (req, res) => {
    try {
        const { phone, amount, memberId } = req.body;
        const userId = req.user.id;

        // Validate payment
        if (!phone || !amount || !memberId) {
            return res.status(400).json({ error: 'Phone, amount, and memberId are required' });
        }

        // Format phone number
        const formattedPhone = phone.startsWith('254') ? phone : 
                             phone.startsWith('0') ? `254${phone.substring(1)}` : 
                             `254${phone}`;

        // In production, this would call real MPESA API
        // For now, simulate payment
        const mpesaResponse = await simulateMpesaPayment(formattedPhone, amount);

        // Record payment
        const currentDate = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        
        const [result] = await pool.query(`
            INSERT INTO payments (member_id, user_id, amount, month, year, date_paid, due_date, 
                                 status, receipt_no, mpesa_code, payment_method, verified)
            VALUES (?, ?, ?, ?, ?, NOW(), ?, 'pending', ?, ?, 'mpesa', FALSE)
        `, [
            memberId,
            userId,
            amount,
            monthNames[currentDate.getMonth()],
            currentDate.getFullYear().toString(),
            new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 10), // 10th of next month
            `MPS${Date.now().toString().slice(-8)}`,
            mpesaResponse.MpesaReceiptNumber
        ]);

        // Update member's last payment
        await pool.query(
            `UPDATE members 
             SET last_payment_date = CURDATE(),
                 next_payment_deadline = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
             WHERE id = ?`,
            [memberId]
        );

        res.json({
            message: 'Payment initiated successfully',
            paymentId: result.insertId,
            mpesaResponse
        });
    } catch (err) {
        console.error('Payment error:', err);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

// Verify payment
router.post('/verify/:paymentId', async (req, res) => {
    try {
        const { receiptNumber } = req.body;

        // In production, verify with MPESA
        const isVerified = await verifyMpesaPayment(receiptNumber);

        if (isVerified) {
            await pool.query(`
                UPDATE payments 
                SET status = 'paid', verified = TRUE, verified_at = NOW()
                WHERE id = ? AND receipt_no = ?
            `, [req.params.paymentId, receiptNumber]);

            res.json({ message: 'Payment verified successfully' });
        } else {
            res.status(400).json({ error: 'Payment verification failed' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper functions
async function simulateMpesaPayment(phone, amount) {
    // Simulate MPESA API call
    return {
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CustomerMessage: "Success. Request accepted for processing",
        CheckoutRequestID: `ws_CO_${Date.now()}`,
        MerchantRequestID: `1000-${Date.now()}`,
        MpesaReceiptNumber: `MPS${Math.floor(Math.random() * 10000000)}`
    };
}

async function verifyMpesaPayment(receiptNumber) {
    // Simulate verification
    return true;
}

module.exports = router;