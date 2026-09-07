import { LockerAssignment } from './locker-assignment.entity.js';

function open(at = new Date('2026-06-02T00:00:00.000Z')) {
  return LockerAssignment.open({
    id: 'a-1',
    lockerId: 'l-1',
    pickupCodeHash: 'hash',
    storedByAgent: 'agent-9',
    now: at,
  });
}

describe('LockerAssignment', () => {
  it('opens active, with no retrieval time or fee', () => {
    const a = open();
    expect(a.isActive).toBe(true);
    expect(a.retrievedAt).toBeNull();
    expect(a.storageFeeMinor).toBeNull();
    expect(a.storedAt.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('close() returns an inactive copy with the fee, leaving the original active', () => {
    const a = open();
    const closed = a.close({
      now: new Date('2026-06-05T00:00:00.000Z'),
      storageFeeMinor: 800,
    });
    expect(a.isActive).toBe(true);
    expect(closed.isActive).toBe(false);
    expect(closed.storageFeeMinor).toBe(800);
    expect(closed.retrievedAt?.toISOString()).toBe('2026-06-05T00:00:00.000Z');
  });

  it('clamps retrievedAt to storedAt when the clock is behind', () => {
    const a = open(new Date('2026-06-02T00:00:00.000Z'));
    const closed = a.close({
      now: new Date('2026-05-01T00:00:00Z'),
      storageFeeMinor: 0,
    });
    expect(closed.retrievedAt).toEqual(a.storedAt);
  });
});
