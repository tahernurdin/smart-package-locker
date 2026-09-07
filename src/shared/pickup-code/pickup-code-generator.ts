export const PICKUP_CODE_GENERATOR = Symbol('PICKUP_CODE_GENERATOR');

/** Produces the plaintext pickup code handed to the customer. */
export interface PickupCodeGenerator {
  generate(): string;
}
