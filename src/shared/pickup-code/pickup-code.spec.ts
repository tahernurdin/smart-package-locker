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
    const hash = hasher.hash('482913');
    expect(hasher.verify('482913', hash)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const hash = hasher.hash('482913');
    expect(hasher.verify('000000', hash)).toBe(false);
  });

  it('rejects a malformed hash without throwing', () => {
    expect(hasher.verify('482913', 'not-a-hash')).toBe(false);
  });

  it('does not store the plaintext in the hash', () => {
    expect(hasher.hash('482913')).not.toContain('482913');
  });
});
