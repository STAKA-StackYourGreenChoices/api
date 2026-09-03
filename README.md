# api

NestJS + Prisma + PostgreSQL.

## Run it

```bash
cp .env.example .env
pnpm install
pnpm prisma generate
pnpm migrate:deploy
pnpm seed          # optional
pnpm start:dev     # http://localhost:7070
```

That assumes a PostgreSQL on `localhost:5432` with user `dev` / password `dev`
and a database called `app` — which is what `DATABASE_URL` in `.env.example`
points at. If you don't have one, start it with Docker:

```bash
docker compose -f ../infra/docker-compose.dev.yml up -d    # start
docker compose -f ../infra/docker-compose.dev.yml down     # stop
```

If you already run Postgres natively, skip the Docker step — port 5432 can only
have one owner. Point `DATABASE_URL` at your own database instead, or create the
expected one:

```bash
psql -d postgres -c "CREATE ROLE dev LOGIN PASSWORD 'dev' CREATEDB;"
createdb -O dev app
```

- Swagger UI — `/docs`
- Health — `/health` (checks the DB), `/health/live` (no dependencies)

## Scripts

| Command | What it does |
|---|---|
| `pnpm start:dev` | Run with watch mode |
| `pnpm build` | Compile to `dist/` |
| `pnpm start:prod` | Run the compiled build |
| `pnpm lint` | ESLint, autofixing what it can |
| `pnpm test` | Unit tests (mocked, no Docker) |
| `pnpm migrate:dev` | Create and apply a migration |
| `pnpm migrate:deploy` | Apply existing migrations (what the server runs) |
| `pnpm openapi:generate` | Regenerate `openapi.json` |

`pnpm test:integration` and `pnpm test:e2e` exist and use a real PostgreSQL via
Testcontainers, so they need Docker running. Nothing forces you to run them.

## Docker

```bash
docker build -t api:local .
```

`prisma` is a **production** dependency on purpose — the image runs
`prisma migrate deploy` at startup, after dev dependencies are pruned.

## Migrations

```bash
pnpm migrate:dev --name add_refunds
```

Migrations live in `prisma/migrations/` and are committed alongside the code
that reads them.
