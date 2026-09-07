import type { Pool } from 'mysql2/promise';
import { withTransaction } from './transaction.js';

function fakeConn() {
  const calls: string[] = [];
  const conn = {
    beginTransaction: async () => void calls.push('begin'),
    commit: async () => void calls.push('commit'),
    rollback: async () => void calls.push('rollback'),
    release: () => void calls.push('release'),
  };
  const pool = { getConnection: async () => conn } as unknown as Pool;
  return { calls, pool };
}

describe('withTransaction', () => {
  it('commits then releases on success, returning the callback value', async () => {
    const { calls, pool } = fakeConn();
    const result = await withTransaction(pool, async () => 42);
    expect(result).toBe(42);
    expect(calls).toEqual(['begin', 'commit', 'release']);
  });

  it('rolls back then releases on throw, and rethrows', async () => {
    const { calls, pool } = fakeConn();
    await expect(
      withTransaction(pool, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(calls).toEqual(['begin', 'rollback', 'release']);
  });
});
