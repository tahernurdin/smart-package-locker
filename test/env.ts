/**
 * Loads the e2e environment into `process.env`.
 *
 * The app reads its environment through `ConfigModule.forRoot()`, which only
 * runs once a Nest module is compiled. Every suite migrates *before* that, so at
 * migration time `process.env` is bare and `parseDatabase` quietly falls back to
 * its development defaults — which is how a suite can migrate one database and
 * then run the app against another. Vitest does not load `.env` itself (it only
 * exposes prefixed variables to `import.meta.env`), so the suites do it here,
 * from `setupFiles` and `globalSetup`, before anything calls
 * `loadConfiguration()`.
 *
 * `process.loadEnvFile` never overwrites a variable that is already set, so the
 * files are loaded most-specific first. The resulting precedence is: a real
 * shell variable (CI) beats `.env.test`, which beats `.env`.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILES = ['.env.test', '.env'];

export function loadTestEnv(): void {
  for (const file of ENV_FILES) {
    const path = join(process.cwd(), file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
