/**
 * Spins a throwaway PostgreSQL in Docker for the DB-backed suites.
 *
 * Mocking the ORM tests your mocks. Anything touching a repository, a
 * transaction, a migration or a raw query gets a real database.
 */
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

let container: StartedPostgreSqlContainer | undefined;

export async function startTestDatabase(): Promise<StartedPostgreSqlContainer> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test')
    .withUsername('test')
    .withPassword('test')
    // Reuse keeps the container alive between local runs — a big speedup.
    // Testcontainers ignores this in CI unless explicitly enabled.
    .withReuse()
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();

  const prismaBinary = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  execSync(`"${prismaBinary}" migrate deploy`, {
    stdio: 'inherit',
    env: process.env,
  });

  return container;
}

export async function stopTestDatabase(): Promise<void> {
  await container?.stop();
  container = undefined;
}
