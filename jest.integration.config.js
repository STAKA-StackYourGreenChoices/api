/**
 * DB-backed suite against a real PostgreSQL from Testcontainers.
 *
 * --runInBand (see package.json) is required: parallel Jest workers sharing one
 * Postgres deadlock on TRUNCATE. If this gets slow, give each worker its own
 * schema via JEST_WORKER_ID rather than falling back to mocks.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.integration-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 180000,
};
