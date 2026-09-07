export const CLOCK = Symbol('CLOCK');

/** Injected wherever "now" is needed, so tests can freeze or advance time. */
export interface Clock {
  now(): Date;
}
