// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper function for database queries
async function query(sql, params) {
    try {
        const [results] = await pool.query(sql, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error.message);
        throw error;
    }
}

// Helper function for single result queries
async function queryOne(sql, params) {
    const results = await query(sql, params);
    return results.length > 0 ? results[0] : null;
}

// Register new user (Public)
router.post('/register', async (req, res) => {
    let connection;
    try {
        const { name, email, phone, password, confirmPassword } = req.body;

        console.log('Registration attempt:', { name, email, phone });

        // Validation
        if (!name || !email || !phone || !password || !confirmPassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Phone validation (Kenyan format)
        const phoneRegex = /^(07|01)\d{8}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ 
                error: 'Invalid phone number format. Use Kenyan format like 0712345678' 
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Check if user already exists
            const existing = await connection.query(
                'SELECT id FROM users WHERE email = ? OR phone = ?',
                [email, phone]
            );

            if (existing[0].length > 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'User already exists with this email or phone' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create user record
            const [userResult] = await connection.query(
                `INSERT INTO users (name, email, phone, password, role, status) 
                 VALUES (?, ?, ?, ?, 'member', 'active')`,
                [name, email, phone, hashedPassword]
            );

            const userId = userResult.insertId;

            // Create member record
            const [memberResult] = await connection.query(
                `INSERT INTO members (name, phone, email, status, joined_date, user_id) 
                 VALUES (?, ?, ?, 'active', CURDATE(), ?)`,
                [name, phone, email, userId]
            );

            const memberId = memberResult.insertId;

            // Update user with member_id
            await connection.query(
                'UPDATE users SET member_id = ? WHERE id = ?',
                [memberId, userId]
            );

            await connection.commit();

            // Create token
            const token = jwt.sign(
                { 
                    id: userId, 
                    email, 
                    role: 'member',
                    name,
                    memberId 
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            // Set cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            });

            console.log('✅ User registered successfully:', email);

            res.status(201).json({
                message: 'Registration successful',
                user: { 
                    id: userId, 
                    name, 
                    email, 
                    phone, 
                    role: 'member',
                    memberId 
                },
                token
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('❌ Registration error:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Email or phone already exists' });
        }
        
        res.status(500).json({ 
            error: 'Registration failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Login user (Public)
router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        console.log('Login attempt for:', identifier);

        if (!identifier || !password) {
            return res.status(400).json({ 
                error: 'Email/phone and password are required'
            });
        }

        // Find user by email OR phone
        const users = await query(
            `SELECT u.*, m.id as member_id 
             FROM users u 
             LEFT JOIN members m ON u.member_id = m.id 
             WHERE u.email = ? OR u.phone = ?`,
            [identifier, identifier]
        );

        console.log(`Found ${users.length} user(s) for identifier: ${identifier}`);

        if (users.length === 0) {
            console.log('❌ No user found with identifier:', identifier);
            return res.status(401).json({ 
                error: 'Invalid email/phone or password'
            });
        }

        const user = users[0];
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            console.log('❌ Invalid password for:', identifier);
            return res.status(401).json({ 
                error: 'Invalid email/phone or password'
            });
        }

        // Check account status
        if (user.status !== 'active') {
            return res.status(403).json({ 
                error: `Account is ${user.status}. Please contact administrator.`,
                status: user.status 
            });
        }

        // Update last login
        await query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        // Create token
        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                role: user.role, 
                name: user.name,
                memberId: user.member_id 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });

        console.log('✅ Login successful for:', user.email);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                status: user.status,
                profile_image: user.profile_image,
                member_id: user.member_id
            },
            token
        });

    } catch (error) {
        console.error('❌ Login error:', error.message);
        res.status(500).json({ 
            error: 'Login failed',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Request password reset (Public)
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if user exists
        const users = await query(
            'SELECT id, name, email FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            // Don't reveal that user doesn't exist for security
            return res.json({ 
                message: 'If your email exists in our system, you will receive a password reset link'
            });
        }

        const user = users[0];
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        // Set expiration (1 hour from now)
        const expiresAt = new Date(Date.now() + 3600000);
        
        // Save reset token
        await query(
            'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
            [email, resetTokenHash, expiresAt]
        );

        // In production, send email with reset link
        // For now, we'll just return the token (in production, send via email)
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password.html?token=${resetToken}`;
        
        console.log(`Password reset link for ${email}: ${resetLink}`);

        res.json({
            message: 'Password reset link generated',
            resetLink: process.env.NODE_ENV === 'development' ? resetLink : undefined
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// Reset password with token (Public)
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword, confirmPassword } = req.body;

        if (!token || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Hash the token to compare with stored hash
        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        // Find valid reset token
        const resetRecords = await query(
            'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW() AND used = FALSE',
            [resetTokenHash]
        );

        if (resetRecords.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid or expired reset token. Please request a new password reset.' 
            });
        }

        const resetRecord = resetRecords[0];
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update user password
        await query(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, resetRecord.email]
        );
        
        // Mark token as used
        await query(
            'UPDATE password_resets SET used = TRUE WHERE id = ?',
            [resetRecord.id]
        );

        console.log(`Password reset for: ${resetRecord.email}`);

        res.json({ 
            message: 'Password reset successful. You can now login with your new password.' 
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Get current user (Protected)
router.get('/me', async (req, res) => {
    try {
        const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const verified = jwt.verify(token, JWT_SECRET);
        
        const users = await query(
            `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.profile_image, u.member_id,
                    m.joined_date, m.total_contributions, m.total_loans
             FROM users u
             LEFT JOIN members m ON u.member_id = m.id
             WHERE u.id = ?`,
            [verified.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Get current user error:', error.message);
        
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        
        res.status(500).json({ error: 'Failed to get user information' });
    }
});

// Logout (Public)
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

// Change password (Protected)
router.post('/change-password', async (req, res) => {
    try {
        const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const verified = jwt.verify(token, JWT_SECRET);
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New passwords do not match' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Get user with current password
        const users = await query(
            'SELECT * FROM users WHERE id = ?',
            [verified.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        
        if (!validPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await query(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, verified.id]
        );

        res.json({ message: 'Password changed successfully' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Admin: Get all users (Admin only)
router.get('/admin/users', async (req, res) => {
    try {
        const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const verified = jwt.verify(token, JWT_SECRET);
        
        if (verified.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const users = await query(
            `SELECT u.*, m.joined_date, m.total_contributions, m.total_loans
             FROM users u
             LEFT JOIN members m ON u.member_id = m.id
             ORDER BY u.created_at DESC`
        );

        res.json({ users });
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Admin: Update user status (Admin only)
router.patch('/admin/users/:id/status', async (req, res) => {
    try {
        const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const verified = jwt.verify(token, JWT_SECRET);
        
        if (verified.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'inactive', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        await query(
            'UPDATE users SET status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'User status updated successfully' });
    } catch (error) {
        console.error('Admin update user status error:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

module.exports = router;