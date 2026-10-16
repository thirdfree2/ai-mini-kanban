# Neon setup verification — 16 October 2026

## Target and provisioned services

- Organization: `org-noisy-dream-61232720`
- Project: `crimson-base-01296441`
- Branch: `production`
- Service: PostgreSQL only. Existing Go authentication remains in place.

`npm i -g neon@latest` completed: `added 155 packages in 6s`.

The first `neon init` stopped because Neon skills require Node22.20+ and the default shell uses Node20.20.2. Retrying the same command with the installed Node26.11.1 succeeded:

```sh
neon init -y --org-id org-noisy-dream-61232720 --project-id crimson-base-01296441 --branch production --services postgres
neon deploy
```

Deploy authenticated successfully and reported:

```text
No changes — branch production already matches the policy.
Utilized services: Postgres
Pulled 3 Neon variables into .env.local
  Postgres        DATABASE_URL, DATABASE_URL_UNPOOLED
  Branch          NEON_BRANCH
```

The local environment file has owner-only permissions and is ignored by Git. No connection string or password is included in this report.

## Application wiring

`neon.ts` records PostgreSQL-only policy. Go retains `pgx`: pooled `DATABASE_URL` for requests, direct `DATABASE_URL_UNPOOLED` for schema setup, with a maximum of five runtime connections. The root build command compiles React and Go. `npm run start:neon` loads the local environment file and serves both on localhost3002. Render configuration accepts both URLs through secret inputs.

## Executed build and startup

`npm run build` exited0. Output included:

```text
> npm --prefix frontend run build && cd backend && go build -o ../dist/server .
vite v6.4.4 building for production...
✓ 1578 modules transformed.
✓ built in 868ms
```

An initial start was attempted before Go compilation completed and correctly reported `Build the application first with npm run build.` Retrying after build completion started successfully:

```text
> node scripts/start-neon.mjs
Kanban with the configured PostgreSQL database: http://localhost:3002
```

Actual Neon-backed health check: HTTP200, `{"status":"ok"}`.

The combined Docker image also built successfully and passed Neon-backed smoke checks at localhost3003: root200, deep SPA route200, health200, unknown API404, missing asset404.

## End-to-end proof against the real Neon database

Executed against the native application connected to the configured Neon PostgreSQL branch:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3002 API_BASE_URL=http://localhost:3002/api npm run test:e2e
```

Final command output: `8 passed (37.8s)`, with zero retries. Coverage includes authentication/logout, cross-user ownership denial, board/task CRUD, desktop drag-and-drop, mobile movement, persistence after reload/login, invalid date/leap-day/range validation, continuous calendar bars, distinct colors, overlap filters, timezone and month-boundary behavior.

Tests created unique accounts and removed their own boards/tasks. Test accounts remain as documented by the test suite. No existing user data was deleted. Go configuration/unit/race tests and build also passed; the optional Go database integration test was skipped in the native unit run because TEST_DATABASE_URL was not set. Browser tests exercised the actual Neon database instead.

No unresolved service wiring failures remain. No frontend cloud host was deployed by `neon deploy`; it provisions backend services and pulls environment variables.
