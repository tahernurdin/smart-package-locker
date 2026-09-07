import type { Pool, PoolConnection } from 'mysql2/promise';

/**
 * Runs `fn` inside a single transaction on a dedicated connection, committing on
 * success and rolling back on any throw. The connection is always released.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
