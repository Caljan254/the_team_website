// server/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const [members] = await pool.query('SELECT COUNT(*) as count FROM members');
        const [users] = await pool.query('SELECT COUNT(*) as count FROM users');
        
        const [payments] = await pool.query(`
            SELECT 
                COUNT(*) as total_payments,
                SUM(amount) as total_collected,
                SUM(penalty_amount) as total_penalties,
                MONTH(CURDATE()) as current_month,
                YEAR(CURDATE()) as current_year
            FROM payments 
            WHERE status = 'paid'
            AND MONTH(date_paid) = MONTH(CURDATE())
            AND YEAR(date_paid) = YEAR(CURDATE())
        `);

        const [loans] = await pool.query(`
            SELECT 
                COUNT(*) as active_loans,
                SUM(amount) as total_loans_amount,
                SUM(remaining_amount) as outstanding_balance
            FROM loans 
            WHERE status IN ('active', 'approved')
        `);

        // Calculate deadline
        const currentDate = new Date();
        const currentDay = currentDate.getDate();
        let deadlineDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 10);
        
        if (currentDay > 10) {
            deadlineDate.setMonth(deadlineDate.getMonth() + 1);
        }

        const timeDiff = deadlineDate - currentDate;
        const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        const hoursRemaining = Math.ceil((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutesRemaining = Math.ceil((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        res.json({
            members: {
                total: members[0].count,
                active: users[0].count
            },
            payments: {
                this_month: payments[0]?.total_collected || 0,
                total_collected: payments[0]?.total_collected || 0,
                penalties: payments[0]?.total_penalties || 0
            },
            loans: {
                active: loans[0]?.active_loans || 0,
                total_amount: loans[0]?.total_loans_amount || 0,
                outstanding: loans[0]?.outstanding_balance || 0
            },
            deadline: {
                date: deadlineDate.toISOString().split('T')[0],
                days_remaining: Math.max(0, daysRemaining),
                hours_remaining: Math.max(0, hoursRemaining),
                minutes_remaining: Math.max(0, minutesRemaining),
                is_overdue: daysRemaining < 0
            },
            current_month: payments[0]?.current_month || currentDate.getMonth() + 1,
            current_year: payments[0]?.current_year || currentDate.getFullYear()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get upcoming deadlines
router.get('/deadlines', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT m.name, m.phone, m.next_payment_deadline,
                   DATEDIFF(m.next_payment_deadline, CURDATE()) as days_left,
                   CASE 
                     WHEN DATEDIFF(m.next_payment_deadline, CURDATE()) < 0 THEN 'overdue'
                     WHEN DATEDIFF(m.next_payment_deadline, CURDATE()) <= 3 THEN 'urgent'
                     ELSE 'pending'
                   END as priority
            FROM members m
            WHERE m.next_payment_deadline IS NOT NULL
            ORDER BY m.next_payment_deadline ASC
            LIMIT 10
        `);

        res.json({
            message: "success",
            data: rows,
            count: rows.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get recent activity
router.get('/activity', async (req, res) => {
    try {
        const [payments] = await pool.query(`
            SELECT p.*, m.name as member_name
            FROM payments p
            JOIN members m ON p.member_id = m.id
            ORDER BY p.date_paid DESC
            LIMIT 10
        `);

        const [loans] = await pool.query(`
            SELECT l.*, m.name as member_name
            FROM loans l
            JOIN members m ON l.member_id = m.id
            ORDER BY l.application_date DESC
            LIMIT 10
        `);

        res.json({
            recent_payments: payments,
            recent_loans: loans
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;