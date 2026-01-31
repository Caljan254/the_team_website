// server/routes/loans.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// Get all loans
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT l.*, m.name as member_name, m.phone as member_phone,
                   g.name as guarantor_name,
                   CASE 
                     WHEN l.due_date < CURDATE() AND l.status = 'active' THEN 'overdue'
                     ELSE l.status
                   END as display_status,
                   DATEDIFF(l.due_date, CURDATE()) as days_remaining
            FROM loans l
            JOIN members m ON l.member_id = m.id
            LEFT JOIN members g ON l.guarantor_id = g.id
            ORDER BY l.application_date DESC
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

// Apply for loan
router.post('/apply', async (req, res) => {
    try {
        const { member_id, amount, duration_months, guarantor_id, notes } = req.body;
        const userId = req.user.id;

        // Validate eligibility
        const [memberPayments] = await pool.query(`
            SELECT COUNT(*) as payment_count 
            FROM payments 
            WHERE member_id = ? AND status = 'paid' 
            AND date_paid >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
        `, [member_id]);

        if (memberPayments[0].payment_count < 3) {
            return res.status(400).json({ 
                error: 'Must have 3 consecutive months of payments to apply for loan' 
            });
        }

        // Check max loan
        if (amount > 50000) {
            return res.status(400).json({ error: 'Maximum loan amount is KSh 50,000' });
        }

        // Calculate due date
        const applicationDate = new Date();
        const dueDate = new Date(applicationDate);
        dueDate.setMonth(dueDate.getMonth() + (duration_months || 3));

        const [result] = await pool.query(`
            INSERT INTO loans (member_id, user_id, amount, interest_rate, duration_months, 
                              status, application_date, due_date, remaining_amount, guarantor_id, notes)
            VALUES (?, ?, ?, 10.00, ?, 'pending', CURDATE(), ?, ?, ?, ?)
        `, [
            member_id,
            userId,
            amount,
            duration_months || 3,
            dueDate,
            amount * 1.3, // Principal + interest
            guarantor_id,
            notes
        ]);

        res.json({
            message: 'Loan application submitted successfully',
            loanId: result.insertId,
            dueDate: dueDate.toISOString().split('T')[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Calculate loan repayment
router.post('/calculate', async (req, res) => {
    try {
        const { amount, duration_months } = req.body;

        if (!amount || amount > 50000) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const months = duration_months || 3;
        const monthlyInterest = 0.10; // 10%
        
        // Calculate using reducing balance method
        let remaining = amount;
        const monthlyPayments = [];
        let totalInterest = 0;

        for (let i = 0; i < months; i++) {
            const interest = remaining * monthlyInterest;
            const principal = amount / months;
            const totalPayment = principal + interest;
            
            monthlyPayments.push({
                month: i + 1,
                principal: Math.round(principal),
                interest: Math.round(interest),
                total: Math.round(totalPayment),
                remaining: Math.round(remaining - principal)
            });

            totalInterest += interest;
            remaining -= principal;
        }

        res.json({
            amount: parseInt(amount),
            duration_months: months,
            monthly_interest_rate: '10%',
            total_interest: Math.round(totalInterest),
            total_repayment: Math.round(amount + totalInterest),
            monthly_payments: monthlyPayments,
            average_monthly_payment: Math.round((amount + totalInterest) / months)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update loan status (admin only)
router.put('/:id/status', async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const { status } = req.body;
        
        await pool.query(
            `UPDATE loans 
             SET status = ?, 
                 approval_date = CASE WHEN status = 'approved' AND ? = 'approved' THEN approval_date ELSE NOW() END,
                 disbursement_date = CASE WHEN ? = 'approved' THEN NOW() ELSE NULL END
             WHERE id = ?`,
            [status, status, status, req.params.id]
        );

        res.json({ message: 'Loan status updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;