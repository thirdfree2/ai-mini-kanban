# Deploy a free review environment: Render + Neon

The root Dockerfile builds React and Go into one service. Go serves the frontend and `/api` on the same origin. The existing local Docker Compose environment remains available.

## 1. Create a Neon database

1. Sign in at https://console.neon.tech and create a Free project.
2. Choose a region close to your Render service (the Blueprint uses Singapore).
3. Open Connect and copy the PostgreSQL connection string. Keep SSL parameters (at least `sslmode=require`).
4. Store it only in Render's secret environment variables. Never commit it or put it in a `VITE_*` variable, browser code, or screenshots.

The new database starts empty. Local accounts and boards are not automatically transferred. The application initializes its schema when starting.

## 2. Create the Render review service

1. Sign in at https://dashboard.render.com and connect the GitHub account that can access `thirdfree2/ai-mini-kanban`.
2. Choose New → Blueprint and select this repository and the branch containing `render.yaml`.
3. Review the proposed single Web Service. Ensure its plan is **Free**.
4. Set `DATABASE_URL` to the Neon connection string in the secret field.
5. Apply the Blueprint when you are ready to publish the review environment.

The Blueprint enables secure cookies, release mode, and `/api/health` readiness checks. Automatic deployment is disabled; select Manual Deploy for subsequent releases. Render supplies the listening port and HTTPS URL. Initial Blueprint creation deploys immediately; disabling automatic deployments does not prevent that first deployment.

Alternatively create a Docker Web Service manually with repository-root build context and `./Dockerfile`. Set `STATIC_DIR=/app/public`, `DATABASE_URL`, `COOKIE_SECURE=true`, and `GIN_MODE=release`; choose Free and health check `/api/health`.

## 3. Verify

Open the assigned HTTPS URL, register a test account, create a board and a date-ranged task, move it between columns, and reload. Check `/api/health` returns `{"status":"ok"}`. Confirm login/logout and Calendar work on the same URL.

For browser automation against a separate test deployment:

```sh
PLAYWRIGHT_BASE_URL=https://YOUR-SERVICE.onrender.com \
API_BASE_URL=https://YOUR-SERVICE.onrender.com/api \
npm run test:e2e
```

The browser tests create unique test accounts; use a test environment/database.

## Local verification of the deployment image

```sh
docker build -t mini-kanban-review .
docker run --rm --network mini-kanban_default -p 127.0.0.1:3001:8080 \
  -e DATABASE_URL='postgres://kanban:kanban_local_dev@db:5432/kanban?sslmode=disable' \
  mini-kanban-review
```

This example uses the database started by local Compose. HTTPS is handled by Render; local HTTP verification leaves COOKIE_SECURE unset. When the container is running:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3001 API_BASE_URL=http://localhost:3001/api npm run test:e2e
```

## Free plan limits

Render Free services sleep after 15 minutes without traffic and may take about a minute to wake. Neon Free has usage/storage quotas. Review current terms before publishing: [Render Free](https://render.com/docs/free), [Neon pricing](https://neon.com/pricing), [Render Blueprint reference](https://render.com/docs/blueprint-spec).

This setup is intended for a public review/demo environment. Anyone with the URL can register. Keep separate data and secrets for real use. No cloud deployment is performed merely by adding these files or pushing Git commits.
