const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..'))); // Serve static files from root

// Routes
app.get('/api/members', async (req, res) => {
    try {
        const sql = "SELECT * FROM members";
        const [rows] = await db.query(sql);
        res.json({
            "message": "success",
            "data": rows
        });
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        // Aggregated stats
        const sqlMembers = "SELECT count(*) as count FROM members";
        const sqlPaid = "SELECT count(DISTINCT member_id) as count FROM payments WHERE month = ? AND year = ? AND status = 'paid'";
        
        // Simple logic: Current month/year
        const date = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        const currentMonth = monthNames[date.getMonth()];
        const currentYear = date.getFullYear().toString();

        const [memberRows] = await db.query(sqlMembers);
        const [paidRows] = await db.query(sqlPaid, [currentMonth, currentYear]);
        
        res.json({
            totalMembers: memberRows[0].count,
            paidMembers: paidRows[0].count,
            pendingMembers: memberRows[0].count - paidRows[0].count,
            month: currentMonth,
            year: currentYear
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mock M-Pesa Payment
app.post('/api/pay', (req, res) => {
    const { phone, amount, memberId } = req.body;
    
    console.log(`[M-PESA] Initiating STK Push to ${phone} for KSh ${amount}`);
    
    // Simulate Safaricom Response
    setTimeout(async () => {
        console.log(`[M-PESA] Simulation: Payment Successful for ${phone}`);
        // Update DB automatically
        const date = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        
        const sql = `INSERT INTO payments (member_id, amount, month, year, date_paid, status, receipt_no) 
                     VALUES (?, ?, ?, ?, ?, 'paid', ?)`;
        
        const params = [
            memberId, 
            amount, 
            monthNames[date.getMonth()], 
            date.getFullYear().toString(), 
            date.toISOString().slice(0, 19).replace('T', ' '), // MySQL DATETIME format
            'MPS' + Math.floor(Math.random() * 10000000)
        ];

        try {
            const [result] = await db.query(sql, params);
            console.log(`[DB] Payment recorded with ID: ${result.insertId}`);
        } catch (err) {
            console.error('[DB] Error recording payment:', err.message);
        }

    }, 5000); // 5 seconds delay to simulate user entering PIN

    res.json({
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CustomerMessage: "Success. Request accepted for processing"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
