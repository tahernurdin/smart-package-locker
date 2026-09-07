import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvalidLockerSizeError } from './errors.js';
import { LOCKER_SIZES, LockerSize } from './locker-size.js';

describe('LockerSize', () => {
  it('ranks SMALL < MEDIUM < LARGE', () => {
    expect(LockerSize.of('SMALL').rank).toBeLessThan(LockerSize.of('MEDIUM').rank);
    expect(LockerSize.of('MEDIUM').rank).toBeLessThan(LockerSize.of('LARGE').rank);
  });

  it('a larger (or equal) locker fits a package', () => {
    expect(LockerSize.of('MEDIUM').fits(LockerSize.of('SMALL'))).toBe(true);
    expect(LockerSize.of('LARGE').fits(LockerSize.of('LARGE'))).toBe(true);
  });

  it('a smaller locker does not fit a larger package', () => {
    expect(LockerSize.of('SMALL').fits(LockerSize.of('LARGE'))).toBe(false);
    expect(LockerSize.of('MEDIUM').fits(LockerSize.of('LARGE'))).toBe(false);
  });

  it('rejects an unknown size', () => {
    expect(() => LockerSize.of('HUGE')).toThrow(InvalidLockerSizeError);
  });

  it('ranks match migrations/002_seed.sql', () => {
    const sql = readFileSync(
      join(process.cwd(), 'migrations/002_seed.sql'),
      'utf8',
    );
    for (const code of LOCKER_SIZES) {
      const match = sql.match(new RegExp(`\\('${code}',\\s*(\\d+),`));
      expect(match, `seed row for ${code}`).toBeTruthy();
      expect(Number(match![1])).toBe(LockerSize.of(code).rank);
    }
  });
});
