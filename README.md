# Mini Kanban Board

A local development application built with React, TypeScript, Tailwind CSS, Go/Gin and PostgreSQL. Create an account, organize private boards, and manage tasks across To do, In progress and Done.

## Start with Docker

Prerequisites: Docker Desktop (or Docker Engine with Compose).

```sh
docker compose -f deploy/docker-compose.yml up --build -d
```

Open [http://localhost:3000](http://localhost:3000) and register an account. No seed credentials are required. PostgreSQL keeps data in a Docker volume, so restarting containers preserves accounts, boards and tasks.

```sh
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs --tail=100
docker compose -f deploy/docker-compose.yml down
```

The last command stops the environment and preserves the database volume. Do not add `--volumes` unless you intend to delete all local data.

## Features

- Registration, login and logout.
- Private boards with create, rename and delete operations.
- Tasks with title, description and status; create, edit and delete operations.
- Drag and drop between columns plus accessible move controls.
- PostgreSQL persistence and ownership checks in the API.
- Responsive layout with loading and error feedback.

## Development and testing

See the Compose file for service configuration and ports. Frontend source is in `frontend/`, API source and Go tests in `backend/`, and browser tests in `tests/`.

```sh
cd backend
go test ./...
```

```sh
cd frontend
npm ci
npm run build
```

Verified results are recorded in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md): Go build/race tests, PostgreSQL integration, frontend build, and all four Playwright checks passed.

## Architecture

The frontend sends same-origin `/api` requests through its web server to the Go API. The API validates requests, checks the signed-in user's ownership, and stores all application data in PostgreSQL. Authentication uses hashed passwords and expiring server-side sessions. The API initializes its schema on startup.

The implementation plan is in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## MVP boundaries

This development MVP has private boards only. It does not include invitations, shared boards, password reset, email verification, attachments or configurable columns. Production deployment requires environment-specific TLS, secrets management, backups and operational configuration. No production deployment is performed by this project setup.

## Run browser tests

With the Docker environment running, from the project root:

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

The suite runs desktop Chrome and an iPhone-sized Chromium viewport. It includes browser flows and HTTP API checks. Use `npm run test:e2e:report` to inspect the HTML report. `PLAYWRIGHT_BASE_URL` and `API_BASE_URL` override the default frontend and API URLs.

To run Go integration tests against the Compose database without exposing its port:

```sh
docker run --rm --network mini-kanban_default \
  -v "$PWD/backend:/app" -w /app \
  -e TEST_DATABASE_URL='postgres://kanban:kanban_local_dev@db:5432/kanban?sslmode=disable' \
  golang:1.23-alpine go test -v ./...
```

Go tests skip the database integration test when `TEST_DATABASE_URL` is unset. The integration test creates temporary users and removes their data when finished. Browser tests use unique accounts and remove their test boards/tasks; their test accounts remain in the local database.

## Configuration

Compose defaults are for local development. Services bind only to the local computer. Change `WEB_PORT` (default `3000`), `API_PORT` (default `8080`), or `POSTGRES_PASSWORD` through environment variables when starting Compose. Keep an existing volume's database password consistent with the password used when it was created.

For API development outside Docker, set `DATABASE_URL` to a reachable PostgreSQL database, then run `go run .` from `backend/`. The API uses `PORT` (default `8080`) and supports `COOKIE_SECURE=true` for HTTPS environments. For frontend development, run `npm run dev` in `frontend/`; Vite forwards `/api` to `localhost:8080`.

GitHub Actions configuration in `.github/workflows/ci.yml` runs Go race tests, the frontend build, database integration tests, and the complete browser suite against Docker Compose.

## Known issues and limitations

- Frontend production dependencies: `npm audit --omit=dev` reported zero vulnerabilities during verification.
- The Tailwind 3 build dependency tree has seven audit findings involving `braces` and `postcss-selector-parser`. These tools run during builds and are absent from the nginx runtime image. The available automatic remediation requires a Tailwind major-version migration; this is deferred to preserve the verified implementation. Build only trusted project sources.
- Columns are fixed. Task moves between columns persist, but manual ordering within a column is outside this MVP.
- There is no live synchronization across browsers; reload to see another session's changes.
- Browser tests use Chromium with desktop and mobile emulation; Safari and Firefox have not been verified.

## Calendar and date ranges

Open a board and switch between **Board view** and **Calendar**. In the task form, set **Start date** and **End date** to schedule a task. Both dates are optional as a pair; the end date must be on or after the start date. The range is inclusive, so a task appears on every scheduled day, including its final day. Clear both fields to return a task to **Unscheduled**.

The Calendar provides previous/next month controls, **Today**, and **From / To** date filters. Choosing From navigates to that month. The filter includes tasks overlapping the range and displays their occurrences only within the selected dates. Click a date to create a task for that day, or click a calendar task to edit it. Existing undated tasks remain available in the Unscheduled section. Mobile calendars scroll horizontally inside the calendar area.

Dates use calendar days without timezone conversion. The API stores `startDate` and `endDate` as PostgreSQL `DATE` values and returns `YYYY-MM-DD` strings (empty strings for unscheduled tasks). An omitted date field in PATCH preserves the existing value; send both empty strings to clear a range. Startup adds the date columns and range constraint to the existing database without removing data.

### Continuous task bars

Calendar ranges render as one continuous bar per week, spanning all included dates. A range crossing a week boundary continues in the next row with the same color and continuation markers. Overlapping ranges occupy separate lanes. Each task has its own color, shared by its calendar bar, Board card accent, and Unscheduled entry. Colors are derived from the complete board task list so searches, date filters, status changes and reloads preserve the assignment for that task list.
