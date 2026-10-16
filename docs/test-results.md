# Verification results

Verified on 2026-10-16 in the local Docker Desktop development environment.

- Full Docker Compose image build: passed for Go backend and React frontend.
- Three services started: PostgreSQL healthy, backend running, frontend running.
- Playwright final run: **4 passed in 2.0 seconds**, no retries required in the final run.
- Desktop Chromium: real drag-and-drop, saved column movement after reload, registration/login/logout, board/task creation, editing and deletion.
- Mobile Chromium (iPhone 13 viewport): task movement through accessible status control, CRUD and login lifecycle, persistence.
- API tests: authenticated CRUD, cross-user read/change/delete rejection and session logout.
- Browser checks: no uncaught page errors; populated and empty layouts fit both viewport widths.
- Go unit and PostgreSQL integration tests executed separately by backend verification; all passed.

The first API test run exposed an incorrect test expectation (registration returns HTTP 200). The initial browser test used an exact label selector that did not match the wrapping status label. Both test selectors/expectations were corrected and the entire suite rerun successfully. A frontend build attempted before its lockfile was generated failed; the lockfile was subsequently created and the complete image build passed.

Run again with:

```sh
npm ci
npx playwright install chromium
docker compose -f deploy/docker-compose.yml up --build -d
npm run test:e2e
```

The latest detailed report is generated at `playwright-report/index.html`. Review screenshots are retained in `docs/screenshots/`.
