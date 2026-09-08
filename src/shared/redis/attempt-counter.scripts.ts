import { type CommandParser, type RedisArgument, defineScript } from 'redis';

/**
 * A counter of failed attempts that locks out for a fixed time once a cap is
 * reached — the Redis half of it, with no idea what is being attempted. The key
 * (and therefore what "one caller at one thing" means) belongs to the caller.
 *
 * Registered on the client at construction so every call goes out as EVALSHA
 * against the cached script; node-redis falls back to a full EVAL by itself if
 * the server ever answers NOSCRIPT.
 */

/**
 * Returns 0 while the caller may attempt, else the milliseconds left on the
 * block. Reading the count and its TTL in one script keeps them consistent and
 * costs one round trip.
 */
const READ_BLOCK = `
local attempts = tonumber(redis.call('GET', KEYS[1]) or '0')
if attempts < tonumber(ARGV[1]) then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
return ttl`;

/**
 * Counts a failure and (re)sets the expiry.
 *
 * The expiry is refreshed on *every* counted failure, which is what makes the
 * block last the configured time rather than whatever remained of a window
 * opened by the first attempt. Blocked attempts never reach here — they are
 * rejected before any counting — so the key is not kept alive by the requests
 * it is rejecting, and it expires exactly one lockout after the last failure
 * that earned it.
 *
 * INCR and PEXPIRE together, because an INCR whose PEXPIRE is lost to a dropped
 * connection leaves a key that never expires: a permanent lockout.
 */
const COUNT_FAILURE = `
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1`;

/**
 * Both scripts reply with a Lua integer, which RESP3 decodes straight to a
 * number — nothing to transform, so `transformReply` is the library's
 * pass-through `undefined` and only its *type* is declared.
 */
const numberReply = undefined as unknown as () => number;

export const ATTEMPT_COUNTER_SCRIPTS = {
  /** Milliseconds left on the block for `key`, or 0 if it may be attempted. */
  readAttemptBlock: defineScript({
    NUMBER_OF_KEYS: 1,
    SCRIPT: READ_BLOCK,
    parseCommand(
      parser: CommandParser,
      key: RedisArgument,
      maxAttempts: number,
    ) {
      parser.pushKey(key);
      parser.push(String(maxAttempts));
    },
    transformReply: numberReply,
  }),

  /** Counts one failure against `key` and restarts its lockout. */
  countAttemptFailure: defineScript({
    NUMBER_OF_KEYS: 1,
    SCRIPT: COUNT_FAILURE,
    parseCommand(
      parser: CommandParser,
      key: RedisArgument,
      lockoutMs: number,
    ) {
      parser.pushKey(key);
      parser.push(String(lockoutMs));
    },
    transformReply: numberReply,
  }),
};
