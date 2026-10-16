# Render public review deployment

- Application: https://mini-kanban-8mys.onrender.com
- Render service: `srv-db8vhcks728c73b850u0`
- Blueprint: `exs-db8vg549v7es73e17s8g`
- GitHub repository: `thirdfree2/ai-mini-kanban`, branch `main`
- Initial deployed source: `597b42f`
- Plan: Free, Docker, Singapore
- Database: existing Neon project `crimson-base-01296441`, branch `production`
- Database connections stored in Render secret environment variables; values omitted from this document.
- HTTPS cookies enabled; `/api/health` readiness check; manual deployments configured.

Open the public application URL and register an account. This deployment uses the same Neon database as local `npm run start:neon`; it does not automatically import data from the original local Compose PostgreSQL database.

On the Free plan, the service sleeps when idle and the first request may take about a minute to wake it. Plan limits: https://render.com/docs/free.

## Verification on 16 October 2026

Render marked the service **Live** at17:14:31 Asia/Bangkok. Initial Docker build/deploy completed in1m23s. The service dashboard confirms **Free** and deployed source597b42f.

Public health check: HTTP200, `{"status":"ok"}`. Public browser suite: **8 passed in31.1s**, without retries. Desktop and mobile coverage includes registration/login/logout, board/task CRUD, desktop drag-and-drop, mobile status moves, persistence after reload, ownership protections, date validation, continuous range bars, unique task colors, calendar navigation and filters, and no uncaught page errors.

Tests created unique test accounts and removed their own boards/tasks. Existing user boards were preserved. An initial health request timed out while the first deploy was building; readiness passed after Render reported Live.

Screenshots: [Render service](screenshots/render-deploy.png), [public app](screenshots/render-live-app.png), [desktop Calendar](screenshots/public/calendar-desktop.png), [mobile Calendar](screenshots/public/calendar-mobile.png).

Generated browser report is local at `public-playwright-report/index.html` and ignored from Git.

For subsequent releases, open the Render service and choose Manual Deploy. Publishing GitHub commits alone does not deploy app changes because auto-deploy is disabled. Blueprint configuration edits may be synced by Render, so review those separately.
