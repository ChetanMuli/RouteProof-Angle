require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'routeproof',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,      // DATE/DATETIME come back as plain strings (no JS timezone surprises)
  decimalNumbers: true,   // DECIMAL/SUM come back as numbers
  charset: 'utf8mb4',
});

// Keep the DB session in the business timezone so CURDATE()/NOW() match the drivers' day
pool.pool.on('connection', (conn) => conn.query(`SET time_zone='${process.env.DB_TZ || '+05:30'}'`));

const q = async (sql, params = []) => (await pool.query(sql, params))[0];
const one = async (sql, params = []) => (await q(sql, params))[0] || null;
const run = async (sql, params = []) => (await pool.query(sql, params))[0]; // OkPacket (insertId, affectedRows)

module.exports = { pool, q, one, run };
