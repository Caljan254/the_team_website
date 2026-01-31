// server/database.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Aaamumo254%',
    database: process.env.DB_NAME || 'the_team_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Function to initialize database (create tables)
async function initDatabase() {
    let connection;
    try {
        console.log("Checking database connection...");
        connection = await pool.getConnection();
        console.log("Connected to MySQL database.");
        
        // Create database if not exists
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'the_team_db'}\``);
        await connection.query(`USE \`${process.env.DB_NAME || 'the_team_db'}\``);

        // Members Table (for all registered users)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL UNIQUE,
                email VARCHAR(255) UNIQUE,
                status VARCHAR(50) DEFAULT 'active',
                joined_date DATE,
                image VARCHAR(255) DEFAULT 'images/default.jpg',
                total_contributions DECIMAL(10, 2) DEFAULT 0,
                total_loans DECIMAL(10, 2) DEFAULT 0,
                last_payment_date DATE,
                next_payment_deadline DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INT,
                INDEX idx_email (email),
                INDEX idx_phone (phone)
            )
        `);

        // Users Table for Authentication
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(20) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'member') DEFAULT 'member',
                status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                profile_image VARCHAR(255) DEFAULT 'images/default-avatar.jpg',
                member_id INT,
                reset_token VARCHAR(255),
                reset_token_expiry DATETIME,
                INDEX idx_email (email),
                INDEX idx_phone (phone)
            )
        `);

        // Payments Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT,
                user_id INT,
                amount DECIMAL(10, 2),
                month VARCHAR(50),
                year VARCHAR(10),
                date_paid DATETIME,
                due_date DATE,
                payment_date DATE,
                status ENUM('pending', 'paid', 'overdue', 'failed') DEFAULT 'pending',
                penalty_amount DECIMAL(10, 2) DEFAULT 0,
                receipt_no VARCHAR(100),
                mpesa_code VARCHAR(100),
                payment_method ENUM('mpesa', 'cash', 'bank') DEFAULT 'mpesa',
                verified BOOLEAN DEFAULT FALSE,
                verified_at DATETIME
            )
        `);

        // Loans Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS loans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT,
                user_id INT,
                amount DECIMAL(10, 2),
                interest_rate DECIMAL(5, 2) DEFAULT 10.00,
                duration_months INT DEFAULT 3,
                status ENUM('pending', 'approved', 'rejected', 'active', 'completed', 'defaulted') DEFAULT 'pending',
                application_date DATE,
                approval_date DATE,
                disbursement_date DATE,
                due_date DATE,
                amount_paid DECIMAL(10, 2) DEFAULT 0,
                remaining_amount DECIMAL(10, 2),
                penalty_applied DECIMAL(10, 2) DEFAULT 0,
                guarantor_id INT,
                notes TEXT
            )
        `);

        // Password Reset Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                token VARCHAR(255) NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_token (token),
                INDEX idx_email (email)
            )
        `);

        // Check if admin exists
        const [userRows] = await connection.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
        if (userRows[0].count === 0) {
            console.log("Creating admin user...");
            await seedAdminUser(connection);
        }

        console.log("✓ Database initialization complete!");
        
    } catch (error) {
        console.error("✗ Database Initialization Error:", error.message);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function seedAdminUser(connection) {
    try {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        // Create admin user
        await connection.query(
            "INSERT INTO users (name, email, phone, password, role, status) VALUES (?, ?, ?, ?, 'admin', 'active')",
            ['Admin User', 'masilakisangau@gmail.com', '0790723609', hashedPassword]
        );
        
        console.log("✓ Admin user created successfully!");
        console.log("  Email: masilakisangau@gmail.com");
        console.log("  Phone: 0790723609");
        console.log("  Password: admin123");
        
    } catch (error) {
        console.error("Error creating admin user:", error.message);
    }
}

// Start initialization
initDatabase();

module.exports = { pool, initDatabase };