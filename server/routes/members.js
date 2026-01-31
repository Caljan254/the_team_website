// server/routes/members.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// Get all members
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT m.*, 
                   u.status as user_status,
                   u.profile_image as user_image,
                   (SELECT COUNT(*) FROM payments p WHERE p.member_id = m.id AND p.status = 'paid') as payments_count,
                   (SELECT SUM(amount) FROM payments p WHERE p.member_id = m.id AND p.status = 'paid') as total_paid,
                   (SELECT status FROM payments p WHERE p.member_id = m.id AND p.month = ? AND p.year = ? ORDER BY p.id DESC LIMIT 1) as current_month_status
            FROM members m
            LEFT JOIN users u ON u.member_id = m.id
            ORDER BY m.joined_date DESC
        `, ['January', '2026']); // Current month/year

        res.json({
            message: "success",
            data: rows,
            count: rows.length
        });
    } catch (err) {
        console.error('Error fetching members:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get single member
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT m.*, 
                   u.email as user_email,
                   u.status as user_status,
                   (SELECT COUNT(*) FROM payments p WHERE p.member_id = m.id AND p.status = 'paid') as payments_count,
                   (SELECT SUM(amount) FROM payments p WHERE p.member_id = m.id AND p.status = 'paid') as total_paid,
                   (SELECT SUM(penalty_amount) FROM payments p WHERE p.member_id = m.id) as total_penalties
            FROM members m
            LEFT JOIN users u ON u.member_id = m.id
            WHERE m.id = ?
        `, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        res.json({
            message: "success",
            data: rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add new member (admin only)
router.post('/', async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const { name, phone, email, joined_date, image } = req.body;

        const [result] = await pool.query(
            `INSERT INTO members (name, phone, email, joined_date, image, next_payment_deadline) 
             VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 10 DAY))`,
            [name, phone, email, joined_date, image || 'images/default.jpg']
        );

        res.json({
            message: 'Member added successfully',
            memberId: result.insertId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update member
router.put('/:id', async (req, res) => {
    try {
        const { name, phone, email, status } = req.body;

        await pool.query(
            `UPDATE members 
             SET name = ?, phone = ?, email = ?, status = ?
             WHERE id = ?`,
            [name, phone, email, status, req.params.id]
        );

        res.json({ message: 'Member updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;