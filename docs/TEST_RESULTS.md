# Verification results

Verified locally on 16 October 2026.

| Check | Result |
|---|---|
| Native Go build | Passed |
| Go unit tests with race detection | Passed |
| Go 1.23 Docker tests with PostgreSQL integration enabled | Passed |
| Frontend TypeScript and Vite production build | Passed |
| Docker Compose image builds | Passed |
| Frontend HTTP access at localhost:3000 | Passed |
| API health at localhost:8080/api/health | Passed (`status: ok`) |
| Frontend runtime dependency audit | Zero vulnerabilities |

Go integration coverage includes registration, board/task creation, cross-user read/update/delete denial, invalid status rejection, persisted status/position, session expiry, and logout revocation.

Final Playwright run: **4/4 passed**, without retries (2.0 seconds). Two specs run in desktop Chromium and an iPhone 13-sized Chromium viewport. Coverage includes registration/login/logout, board/task creation/edit/deletion, desktop drag and drop, mobile status controls, persistence after reload/login, cross-user API denial, populated and empty viewport fit, and no uncaught page errors.

Earlier test-only failures were corrected: registration success is HTTP 200, and the Status control requires a scoped selector. The final run has no unresolved application failures.

Screenshots: [desktop](screenshots/board-desktop.png), [mobile](screenshots/board-mobile.png). Browser HTML report: `playwright-report/index.html` (generated locally, ignored from source control). Build-only dependency findings and MVP boundaries are documented in the README. GitHub Actions is configured but has not run on a hosted runner in this workspace.

## Calendar extension — 16 October 2026

- Go build, race tests and PostgreSQL integration passed after the additive date migration.
- Playwright expanded to eight checks across desktop/mobile: original Kanban flows, task date API validation, and Calendar flows.
- Calendar coverage: multi-day inclusive display, October/November boundary, America/Los_Angeles timezone, overlap filters, invalid and empty ranges, date-prefilled creation, persisted rescheduling and clearing to Unscheduled.
- Date API coverage: invalid dates and leap days, reversed and incomplete ranges, partial update merged validation, omitted dates preserved, and clearing both dates.
- Existing database data is preserved; task date columns are added on startup.

## Continuous ranges and distinct task colors — 16 October 2026

Frontend production build and Docker Compose rebuild/startup passed; all three services healthy. Full Playwright suite: **8/8 passed in 3.4 seconds**, without retries.

Added verification for one three-day bar spanning three columns; ranges split only at week boundaries with consistent color; overlapping tasks in separate lanes with nonoverlapping rendered boxes; distinct task colors; color persistence across reload and filters; and inclusive clipping of bars to the selected filter range. Existing Calendar, date API, Kanban and mobile checks remain passing. Desktop/mobile screenshots were refreshed and visually inspected.

## Render + Neon deployment preparation — 16 October 2026

- Root combined Docker image built successfully; runtime is nonroot UID 10001 with CA certificates.
- All eight Playwright checks passed against the combined same-origin service at localhost:3001 (3.6 seconds).
- Static smoke checks passed: root/deep SPA routes200 HTML; API health200 JSON; unknown API, missing assets and hidden files404.
- Go race tests/build passed with static routing and traversal protection tests.
- Render Blueprint and CI YAML parsed locally; Blueprint uses Free, Singapore, explicit secret input, HTTPS cookies and manual deployment settings. Hosted Render validation/deployment has not been executed.
- A health probe initially returned503 because the local database container had stopped; after restart, health returned200.
- No public cloud environment was deployed. Neon credentials must be entered in Render's secret settings.
