import pg from 'pg';
import { config } from '../config.js';

// BIGINT (int8) -> number (an toàn tới 2^53), DATE -> 'YYYY-MM-DD' (tránh lệch múi giờ)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
});

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export const toCamel = (row) => (row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v])) : row);

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows.map(toCamel);
}

export async function one(text, params) {
  return (await query(text, params))[0] ?? null;
}

/** Chạy fn(client) trong 1 transaction. client.q / client.one trả về camelCase. */
export async function tx(fn) {
  const client = await pool.connect();
  const wrapped = {
    raw: client,
    q: async (t, p) => (await client.query(t, p)).rows.map(toCamel),
    one: async (t, p) => (await client.query(t, p)).rows.map(toCamel)[0] ?? null,
  };
  try {
    await client.query('BEGIN');
    const result = await fn(wrapped);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Executor mặc định khi không ở trong transaction */
export const db = { q: query, one };
