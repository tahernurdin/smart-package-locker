import type { AppConfiguration } from '../config/configuration.js';
import { NumericPickupCodeGenerator } from './numeric-pickup-code-generator.js';
import { PickupCodeHasher } from './pickup-code-hasher.js';

describe('NumericPickupCodeGenerator', () => {
  it('always produces a 6-digit string (leading zeros allowed)', () => {
    const gen = new NumericPickupCodeGenerator();
    for (let i = 0; i < 1000; i++) {
      expect(gen.generate()).toMatch(/^\d{6}$/);
    }
  });
});

describe('PickupCodeHasher', () => {
  const hasher = new PickupCodeHasher({
    pickupCodePepper: 'test-pepper',
  } as AppConfiguration);

  it('round-trips a correct code', () => {
    const hash = hasher.hash('482913', 'a-1');
    expect(hasher.verify('482913', 'a-1', hash)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const hash = hasher.hash('482913', 'a-1');
    expect(hasher.verify('000000', 'a-1', hash)).toBe(false);
  });

  it('rejects a malformed hash without throwing', () => {
    expect(hasher.verify('482913', 'a-1', 'not-a-hash')).toBe(false);
  });

  it('does not store the plaintext in the hash', () => {
    expect(hasher.hash('482913', 'a-1')).not.toContain('482913');
  });

  // The assignment id is the salt: without it, one precomputed pass over the
  // 10^6 possible codes would crack every row in the bank at once.
  it('hashes the same code differently per assignment', () => {
    expect(hasher.hash('482913', 'a-1')).not.toBe(hasher.hash('482913', 'a-2'));
  });

  it('will not verify a code against another assignment', () => {
    const hash = hasher.hash('482913', 'a-1');
    expect(hasher.verify('482913', 'a-2', hash)).toBe(false);
  });

  // The pepper is the secret: it is the HMAC key, so a leaked table cannot be
  // attacked by hashing candidate codes without it.
  it('hashes differently under a different pepper', () => {
    const other = new PickupCodeHasher({
      pickupCodePepper: 'other-pepper',
    } as AppConfiguration);
    expect(other.hash('482913', 'a-1')).not.toBe(hasher.hash('482913', 'a-1'));
    expect(other.verify('482913', 'a-1', hasher.hash('482913', 'a-1'))).toBe(
      false,
    );
  });

  it('still fits the CHAR(64) column', () => {
    expect(hasher.hash('482913', 'a-1')).toMatch(/^[0-9a-f]{64}$/);
  });
});
