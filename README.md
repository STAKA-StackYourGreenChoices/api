# api

NestJS API. Prisma + PostgreSQL. Ships as a Docker image to GHCR; deployed by
the pipeline in [`infra`](../infra).

## Local development

```bash
nvm use                                       # Node 22, from .nvmrc
cp .env.example .env
docker compose -f ../infra/docker-compose.dev.yml up -d   # postgres, redis, mailpit
pnpm install
pnpm prisma generate
pnpm migrate:dev
pnpm seed
pnpm start:dev                                # :7070
```

Swagger UI at `/docs`. Health at `/health` (checks the DB) and `/health/live`
(dependency-free — this is what the container HEALTHCHECK hits).

## Tests

| Command | What it is | Needs Docker |
|---|---|---|
| `pnpm test:unit` | Fully mocked. Runs on every commit. | no |
| `pnpm test:integration` | Real PostgreSQL via Testcontainers. | **yes** |
| `pnpm test:e2e` | The full HTTP app, real routes, real DB. | **yes** |
| `pnpm test:all` | All three. | **yes** |

```bash
pnpm test:all
```

Mocking your ORM tests your mocks. Anything touching a repository, a
transaction, a migration or a raw query gets a real database.

## Git hooks

Installed automatically by `pnpm install` (husky).

| Hook | Runs | Bypass |
|---|---|---|
| `pre-commit` | lint-staged, typecheck, unit tests | `git commit --no-verify` |
| `commit-msg` | commitlint (Conventional Commits) | `--no-verify` |
| `pre-push` | lint, format, unit, **openapi freshness**, integration, e2e | `SKIP_INTEGRATION=1 git push` |

Commits must be [Conventional Commits](https://www.conventionalcommits.org/) —
`release-please` reads them to compute the version bump and changelog.

```
feat(orders): add refund endpoint
fix(orders): clamp total when discount exceeds subtotal
chore(deps): bump prisma to 6.9.1
```

## The OpenAPI contract

`openapi.json` is **committed**. It is what `web` and `mobile` generate their
typed clients from, so it must never drift from the code.

```bash
pnpm openapi:generate     # then commit the result
```

CI regenerates it and fails if the working tree is dirty, then diffs it against
`main` and fails on a breaking change unless the PR title is marked `feat!:`.

## Migrations

```bash
pnpm migrate:dev --name add_refunds   # authoring
pnpm migrate:deploy                   # what the server runs
```

> **Migrations must be backward compatible.** The zero-downtime rollout runs the
> old and new containers against the *same* schema for ~35 seconds. Dropping a
> column the old code still selects means 500s for that window.
>
> Expand → migrate → contract, across releases:
> 1. Release N: add the new column (nullable), write both, read old
> 2. Backfill
> 3. Release N+1: read new
> 4. Release N+2: drop the old column
>
> This is also what makes rollback safe — rolling back to N never meets a schema
> it doesn't understand.

## Docker

```bash
docker build -t api:local --build-arg GIT_SHA=$(git rev-parse --short HEAD) .
```

`prisma` is a **production** dependency on purpose: the deploy scripts run
`node_modules/.bin/prisma migrate deploy` inside this image, after dev
dependencies have been pruned.
