import mysql from 'mysql2/promise';
import { config } from '../config.js';

// Shared connection pool used across the app.
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  namedPlaceholders: true,
  dateStrings: true,
  charset: 'utf8mb4_general_ci',
});

/** Run a query and return rows. */
export async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Run a query and return the first row (or null). */
export async function queryOne(sql, params = {}) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/** Execute inside a transaction. cb receives a connection with query/queryOne helpers. */
export async function transaction(cb) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = {}) => {
        const [rows] = await conn.execute(sql, params);
        return rows;
      },
      queryOne: async (sql, params = {}) => {
        const [rows] = await conn.execute(sql, params);
        return rows[0] ?? null;
      },
      raw: conn,
    };
    const result = await cb(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
