import { InvalidPickupCodeError } from './errors.js';

/**
 * The plaintext pickup code. Lives only in memory — the agent's response and the
 * customer's retrieval request. Only its hash is ever persisted.
 */
export class PickupCode {
  private constructor(readonly value: string) {}

  static of(value: string): PickupCode {
    if (!/^\d{6}$/.test(value)) throw new InvalidPickupCodeError();
    return new PickupCode(value);
  }

  toString(): string {
    return this.value;
  }
}
