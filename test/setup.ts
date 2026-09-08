/**
 * Per-file e2e setup. Runs in every worker before the spec is imported, so a
 * suite's `beforeAll` sees the same environment `globalSetup` used to pick the
 * database it created.
 */

import { loadTestEnv } from './env.js';

loadTestEnv();
