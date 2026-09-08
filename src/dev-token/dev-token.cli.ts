import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ALL_ROLES, type Role } from '../shared/auth/roles.js';
import { loadConfiguration } from '../shared/config/configuration.js';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key && argv[i + 1] !== undefined) out[key] = argv[i + 1];
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const role = (args.role ?? '').toUpperCase();
  if (!(ALL_ROLES as readonly string[]).includes(role)) {
    console.error(
      `Usage: npm run token -- --role <${ALL_ROLES.join('|')}> [--sub <id>]`,
    );
    process.exit(1);
  }

  const config = loadConfiguration();
  const jwt = new JwtService({
    secret: config.jwt.secret,
    signOptions: {
      expiresIn: config.jwt.expiresIn as JwtSignOptions['expiresIn'],
    },
  });
  console.log(
    jwt.sign({
      role: role as Role,
      sub: args.sub ?? `${role.toLowerCase()}-dev`,
    }),
  );
}

main();
