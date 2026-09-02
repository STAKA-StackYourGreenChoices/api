/**
 * Fast, fully mocked suite. Runs on every commit via the pre-commit hook.
 * Deliberately scoped to src/ so it can never pick up a DB-backed spec.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!main.ts',
    '!openapi.ts',
    '!instrument.ts',
    '!prisma/seed.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov'],
  testEnvironment: 'node',
};
