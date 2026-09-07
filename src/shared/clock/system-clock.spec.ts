import { SystemClock } from './system-clock.js';

describe('SystemClock', () => {
  it('returns the current time as a Date', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
  });
});
