# PulseDesk

PulseDesk is a production-ready personal productivity system: tasks, habits, sleep tracking, authentication, admin analytics, PostgreSQL storage, and a polished responsive frontend in one deployable app.

It is not a toy localStorage demo. The backend is a real Go API backed by Supabase PostgreSQL through `database/sql` and `github.com/jackc/pgx/v5/stdlib`, with JWT auth, bcrypt passwords, role-based access control, migrations, seed data, CORS, health checks, and Vercel deployment support.

Production: `https://web-three-steel-59.vercel.app`

## What Makes It Solid

- Real backend: Go 1.25, Gin, `database/sql`, pgx PostgreSQL driver.
- Real database: Supabase PostgreSQL via `DATABASE_URL`, no Supabase SDK lock-in.
- Secure auth: bcrypt password hashing, JWT sessions, `/api/auth/me`, role-aware middleware.
- Admin controls: protected admin API, project stats, user table, role management.
- Full productivity workflow: tasks, habits, sleep settings, sleep logs, stats, and dashboard summaries.
- Vercel-ready: static frontend plus Go serverless API route through `api/index.go`.
- Deployment hygiene: no database password, service role key, JWT secret, or Supabase secret in frontend code.
- Idempotent database bootstrap: migrations and seed can run repeatedly without duplicating core demo users.

## Feature Tour

### Authentication

PulseDesk has a complete auth flow:

- Register
- Login
- Logout
- Current user endpoint
- Profile update
- Password change
- JWT-protected routes
- Admin-only routes

`GET /api/auth/me` returns only safe user fields:

```json
{
  "id": 1,
  "name": "User",
  "email": "user@example.com",
  "role": "user",
  "created_at": "2026-05-01T00:00:00Z"
}
```

`password_hash` never leaves the backend.

### Tasks

The task module is built for day-to-day use:

- Create, edit, delete tasks
- Toggle completion
- Filter by active, completed, today, overdue
- Search by title and description
- Priority levels: low, medium, high
- Due dates
- Dashboard cards and counters

### Habits

Habits include more than simple CRUD:

- Create, edit, delete habits
- Daily check/uncheck
- Color tagging
- Current streak
- Weekly rate
- Monthly rate
- Dashboard preview

### Sleep Tracking

PulseDesk tracks sleep as a first-class productivity signal:

- Target bedtime
- Target wake time
- Sleep logs
- Duration calculation
- Sleep quality: poor, normal, great
- Weekly sleep stats
- Best/worst day
- Recommendations based on sleep consistency

### Admin Panel

Admin users can see real PostgreSQL-backed system metrics:

- Total users
- New users today
- Total tasks
- Completed tasks
- Total habits
- Total sleep logs
- Activity over the last 7 days
- User summaries with task, habit, and sleep counts

Normal users receive `403` on `/api/admin/*`.

## Architecture

```text
api/index.go            Vercel Go Function entrypoint
cmd/app/main.go         Long-running local/server entrypoint
app/config              Environment loading and validation
app/database            PostgreSQL connection, migrations, seed
app/server              Gin router, CORS, API wiring
app/handlers            HTTP handlers
app/middleware          Auth and rate-limit middleware
app/repository          SQL repository layer
app/service             Business logic
app/models              Request/response/domain models
app/utils               JWT, password hashing, validators
web/                    Static frontend
```

The same backend logic is shared by:

- local/server mode: `go run ./cmd/app`
- Vercel serverless mode: `api/index.go`

## Database

PulseDesk uses PostgreSQL tables for:

- `users`
- `tasks`
- `habits`
- `habit_checks`
- `sleep_settings`
- `sleep_logs`

PostgreSQL-specific choices:

- `BIGSERIAL` primary keys
- `TIMESTAMPTZ` timestamps
- `TEXT CHECK (...)` instead of MySQL enum
- `ON CONFLICT` upserts
- `INSERT ... RETURNING id`
- `CREATE INDEX IF NOT EXISTS`

Supabase pooler compatibility is handled by adding pgx simple protocol mode to `DATABASE_URL` when needed.

## Environment

Production backend:

```env
APP_ENV=production
PORT=8080
DATABASE_URL=postgres://USER:PASSWORD@HOST:6543/postgres?sslmode=require
JWT_SECRET=change_this_secret_key_please_use_a_strong_random_string
CORS_ORIGIN=https://your-vercel-domain.vercel.app
```

Local fallback when `DATABASE_URL` is not set:

```env
APP_ENV=local
APP_PORT=8082
JWT_SECRET=change_this_secret_key_please_use_a_strong_random_string
CORS_ORIGIN=
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=pulsedesk
DB_USERNAME=postgres
DB_PASSWORD=
```

Rules:

- If `DATABASE_URL` exists, `DB_*` is ignored.
- `JWT_SECRET` must be at least 32 characters.
- Never expose `DATABASE_URL`, `POSTGRES_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, or `JWT_SECRET` in frontend env.

## Local Development

```bash
cp .env.example .env
go mod tidy
go run ./cmd/app
```

Open:

```text
http://localhost:8082
```

## Seed Accounts

The seed is idempotent and stores passwords as bcrypt hashes.

- Admin: `admin@pulsedesk.local` / `admin12345`
- Demo user: `demo@example.com` / `password123`

## API Overview

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/auth/me`
- `PUT /api/auth/password`
- `POST /api/auth/logout`

Tasks:

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `PATCH /api/tasks/:id/toggle`

Habits:

- `GET /api/habits`
- `POST /api/habits`
- `GET /api/habits/:id`
- `PUT /api/habits/:id`
- `DELETE /api/habits/:id`
- `PATCH /api/habits/:id/check`

Sleep:

- `GET /api/sleep/settings`
- `PUT /api/sleep/settings`
- `GET /api/sleep/logs`
- `POST /api/sleep/logs`
- `PUT /api/sleep/logs/:id`
- `DELETE /api/sleep/logs/:id`
- `GET /api/sleep/stats`

Admin:

- `GET /api/admin/stats`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/role`

All non-auth APIs require:

```http
Authorization: Bearer TOKEN
```

## Health Check

```bash
curl https://your-domain.example.com/api/health
```

Expected:

```json
{
  "status": "ok",
  "database": "ok",
  "environment": "production"
}
```

## Deployment

### Vercel

This repo supports one-project Vercel deployment:

- static frontend from `web/`
- Go API from `api/index.go`
- root `vercel.json`
- root `package.json` build script

Required Vercel production env:

```env
APP_ENV=production
DATABASE_URL=postgres://USER:PASSWORD@HOST:6543/postgres?sslmode=require
JWT_SECRET=change_this_secret_key_please_use_a_strong_random_string
CORS_ORIGIN=https://your-vercel-domain.vercel.app
```

Deploy:

```bash
vercel --prod
```

### Render/Railway/Fly.io

The same backend can run as a long-running Go server:

```bash
go build -o app ./cmd/app
./app
```

Set `PORT`, `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN`.

## Frontend API Resolution

All frontend requests go through `PulseDeskAPI.apiFetch`.

API base priority:

1. `window.__API_BASE_URL__`
2. `window.PULSEDESK_CONFIG.API_BASE_URL`
3. `<meta name="api-base-url" content="...">`
4. `window.PULSEDESK_API_BASE_URL` / `window.API_BASE_URL`
5. same-origin fallback
6. `http://localhost:8082` only when opened through `file:`

`apiFetch` handles:

- JSON content type
- Bearer token injection
- `401` cleanup
- redirect to `/auth`
- no fake localStorage backend

## Verification

```bash
go mod tidy
go test ./...
go build -o app.exe ./cmd/app
node --check web/app.js
node --check web/auth.js
node --check web/api-config.js
```

Production smoke used during deployment:

- `/api/health`
- register
- login
- `/api/auth/me`
- tasks create/delete
- normal user gets `403` on admin API
- admin login
- admin stats
- auth/app pages return `200`
- frontend files return valid UTF-8

## Security Notes

- Passwords are bcrypt hashes.
- JWT secret is backend-only.
- Supabase service role key is not used by the frontend.
- `DATABASE_URL` is backend-only.
- `.env`, `.vercel`, logs, binaries, and local generated files are ignored by git.
- The backend logs connection source labels, not full connection strings.

PulseDesk is a compact full-stack app, but the boring production details are handled: database migrations, real auth, admin protection, deployment config, frontend API routing, and safety around secrets.
