/**
 * Conventional Commits. release-please reads these to compute the semver bump
 * and changelog, and the PR-title check enforces the same shape on squash
 * merges — so the commit that lands on main is always machine-readable.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-max-length': [2, 'always', 100],
  },
};
