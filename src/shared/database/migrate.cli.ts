import { loadConfiguration } from '../config/configuration.js';
import { runMigrations } from './migrator.js';

/** Standalone entrypoint for `npm run db:migrate` (local dev without Docker). */
async function main(): Promise<void> {
  const config = loadConfiguration();
  await runMigrations(config.database);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
