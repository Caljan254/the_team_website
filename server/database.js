// server/database.js
const mysql = require('mysql2');

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Aaamumo254%', // Default to empty for local dev, user should configure this
    database: process.env.DB_NAME || 'the_team_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Wrap pool to provide a Promise-based API compatible with our previous usage (mostly)
// But we'll likely need to adjust server.js because mysql2 query syntax is slightly different from sqlite3
const promisePool = pool.promise();

// Function to initialize database (create tables)
async function initDatabase() {
    try {
        console.log("Checking database connection...");
        const connection = await promisePool.getConnection();
        console.log("Connected to MySQL database.");
        
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${pool.config.connectionConfig.database}\``);
        await connection.query(`USE \`${pool.config.connectionConfig.database}\``);

        // Members Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL UNIQUE,
                email VARCHAR(255),
                status VARCHAR(50) DEFAULT 'pending',
                joined_date VARCHAR(50),
                image VARCHAR(255) DEFAULT 'images/default.jpg'
            )
        `);

        // Payments Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT,
                amount DECIMAL(10, 2),
                month VARCHAR(50),
                year VARCHAR(10),
                date_paid DATETIME,
                status VARCHAR(50) DEFAULT 'pending',
                receipt_no VARCHAR(100),
                FOREIGN KEY (member_id) REFERENCES members(id)
            )
        `);
        
        // Seed Data Check
        const [rows] = await connection.query("SELECT count(*) as count FROM members");
        if (rows[0].count === 0) {
            console.log("Seeding Database...");
            await seedData(connection);
        }

        connection.release();
    } catch (error) {
        console.error("Database Initialization Error:", error.message);
        console.log("Ensure you have a MySQL server running and the credentials are correct.");
    }
}

async function seedData(connection) {
    const members = [
        { name: "Mark Masila", phone: "0790723609", email: "masilakisangau@gmail.com", joined: "2023-01-15", image: "images/mark.jpeg" },
        { name: "Michael Kamote", phone: "0794366274", email: "michaelkamote2019@gmail.com", joined: "2023-01-20", image: "images/michael_kamote.jpg" },
        { name: "Lydia Katungi", phone: "0746792834", email: "lydiakatungi2001@gmail.com", joined: "2023-12-15", image: "images/lydia_katungi.jpg" },
        { name: "Joel Mwetu", phone: "0796473760", email: "joedan926@gmail.com", joined: "2023-12-15", image: "images/joel.jpeg" },
        { name: "Munyoki Mutua", phone: "0769083128", email: "munyokimutua513@gmail.com", joined: "2023-12-15", image: "images/munyoki.jpeg" },
        { name: "Mutemwa Willy", phone: "0718510747", email: "mutemwawillie@gmail.com", joined: "2023-12-15", image: "images/mutemwa.jpeg" },
        { name: "Alex Musingi", phone: "0712584869", email: "aleckiejnr@gmail.com", joined: "2026-01-06", image: "images/alex_musingi.jpg" }
    ];

    for (const m of members) {
        await connection.query(
            "INSERT INTO members (name, phone, email, joined_date, image) VALUES (?, ?, ?, ?, ?)",
            [m.name, m.phone, m.email, m.joined, m.image]
        );
    }

    // Mock history for Mark
    // Get ID of Mark
    const [markRows] = await connection.query("SELECT id FROM members WHERE name = 'Mark Masila'");
    if (markRows.length > 0) {
        const memberId = markRows[0].id;
        const payments = [
            { member_id: memberId, month: "September", year: "2025", amount: 600, date: "2025-09-01", status: "paid" },
            { member_id: memberId, month: "October", year: "2025", amount: 600, date: "2025-10-01", status: "paid" },
            { member_id: memberId, month: "November", year: "2025", amount: 600, date: "2025-11-01", status: "paid" },
            { member_id: memberId, month: "December", year: "2025", amount: 600, date: "2025-12-01", status: "paid" }
        ];

        for (const p of payments) {
            await connection.query(
                "INSERT INTO payments (member_id, month, year, amount, date_paid, status) VALUES (?, ?, ?, ?, ?, ?)",
                [p.member_id, p.month, p.year, p.amount, p.date, p.status]
            );
        }
    }
    console.log("Seeding complete.");
}

// Start initialization
initDatabase();

module.exports = promisePool;
