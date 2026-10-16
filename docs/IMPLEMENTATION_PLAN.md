# Mini Kanban implementation plan

## Scope and decisions
- Single-user-owned boards with three fixed task columns: To do, In progress, Done.
- React, TypeScript and Tailwind frontend; Go/Gin JSON API; PostgreSQL storage.
- Registration and login with hashed passwords and expiring server-side sessions.
- Board and task creation, editing and deletion. Task moves persist immediately; accessible move controls complement drag and drop.
- All board/task endpoints enforce ownership. Database initialization runs on application startup.
- Docker Compose runs the database, API, and frontend with health checks.

## Work streams
1. Backend: schema, authentication, ownership checks, CRUD, input validation, Go tests.
2. Frontend: responsive application, authentication, board/task management, drag and drop, loading/error states.
3. QA/infrastructure: Compose, CI, browser tests against a running application.
4. Integration/review: run builds and tests, fix failures, verify startup, document access and limitations.

## Verification gates
- Backend tests and frontend production build succeed.
- Browser tests exercise authentication, boards, task lifecycle, moving tasks and persistence.
- Running application and API health endpoint are reachable.
- README gives reproducible startup, testing, configuration and review instructions.

## Intentional MVP boundaries
No invitations, shared boards, password reset, email delivery, attachments, custom columns, or production deployment.

## Calendar extension
- Add an optional inclusive date range (`startDate`, `endDate`) to each task.
- Keep existing tasks unscheduled and preserve all current data through additive schema migration.
- Validate real calendar dates, complete ranges, and start <= end on create/update.
- Add a monthly Calendar view with navigation, task editing/creation, and an inclusive date-range overlap filter.
- Keep undated tasks visible separately; retain Board view and status movement.
- Verify date persistence, validation, clear/reschedule, overlap display and desktop/mobile browser flows.

## Continuous calendar ranges and task colors
- Render one continuous task bar spanning its inclusive dates within each calendar week.
- Continue cross-week ranges in subsequent rows with clear continuation edges.
- Stack overlapping tasks in separate lanes and retain day-based creation controls.
- Assign distinct task colors consistently across calendar navigation, filtering and reload.
- Verify visual spans, overlap layout, color stability and the existing date/CRUD flows on desktop/mobile.
