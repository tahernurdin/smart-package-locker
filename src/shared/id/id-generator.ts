export const ID_GENERATOR = Symbol('ID_GENERATOR');

/** Produces new entity identifiers. Injected so tests can use stable ids. */
export interface IdGenerator {
  next(): string;
}
