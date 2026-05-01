# PulseDesk

PulseDesk is a Go/Gin productivity dashboard with JWT auth, tasks, habits, sleep tracking, admin stats, and a static HTML/CSS/JavaScript frontend.

Backend storage is PostgreSQL through `database/sql` and `github.com/jackc/pgx/v5/stdlib`. The backend does not use the Supabase SDK.

## Local Development

1. Copy the env template:

```bash
cp .env.example .env
```

2. For local PostgreSQL fallback, set:

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

3. Run the backend:

```bash
go mod tidy
go run ./cmd/app
```

Open `http://localhost:8082`.

## Supabase PostgreSQL Setup

Use the Supabase PostgreSQL connection string, not Supabase API keys:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:6543/postgres?sslmode=require
```

If `DATABASE_URL` is set, the backend ignores `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`.

Do not put `DATABASE_URL`, database passwords, `JWT_SECRET`, Supabase service role keys, or other backend secrets in frontend files.

## Required Env Variables

Production backend:

```env
APP_ENV=production
PORT=8080
DATABASE_URL=postgres://USER:PASSWORD@HOST:6543/postgres?sslmode=require
JWT_SECRET=change_this_secret_key_please_use_a_strong_random_string
CORS_ORIGIN=https://your-vercel-domain.vercel.app
```

`JWT_SECRET` must be at least 32 characters.

## Seed Accounts

The seed is idempotent and stores passwords as bcrypt hashes.

- Admin: `admin@pulsedesk.local` / `admin12345`
- Demo user: `demo@example.com` / `password123`

Passwords are not shown in the UI and are not logged.

## API Checks

Health:

```bash
curl https://your-backend.example.com/api/health
```

Expected shape:

```json
{
  "status": "ok",
  "database": "ok",
  "environment": "production"
}
```

Register/login:

```bash
curl -X POST https://your-backend.example.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Password123","confirm_password":"Password123"}'

curl -X POST https://your-backend.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password123"}'
```

Use the returned token:

```bash
curl https://your-backend.example.com/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

`GET /api/auth/me` returns `id`, `name`, `email`, `role`, and `created_at`; it does not return `password_hash`.

## Backend Deploy

Render/Railway/Fly.io:

1. Build command: `go build -o app ./cmd/app`
2. Start command: `./app`
3. Set the production env variables listed above.
4. Confirm `GET /api/health` returns database `ok`.

The backend reads `PORT` from env. CORS is controlled by `CORS_ORIGIN`; set it to the Vercel frontend URL. OPTIONS preflight is handled by the Gin middleware.

## Frontend Deploy on Vercel

Deploy the `web` directory as the Vercel project root.

Set this Vercel environment variable:

```env
API_BASE_URL=https://your-backend.example.com
```

The Vercel build runs `node scripts/write-config.js`, which writes the public backend URL into `config.js` as `window.PULSEDESK_CONFIG.API_BASE_URL`.

Frontend request priority:

1. `window.__API_BASE_URL__`
2. `window.PULSEDESK_CONFIG.API_BASE_URL`
3. `<meta name="api-base-url" content="...">`
4. `window.PULSEDESK_API_BASE_URL` / `window.API_BASE_URL`
5. local fallback: same-origin, or `http://localhost:8082` when opened through `file:`

Frontend secrets are not required. Never expose `DATABASE_URL`, `POSTGRES_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, or `JWT_SECRET` in Vercel frontend env.

## API Summary

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

All non-auth APIs require `Authorization: Bearer TOKEN`. `/api/admin/*` requires role `admin`; normal users receive `403`.

## Verification

```bash
go mod tidy
go test ./...
go build -o app.exe ./cmd/app
node --check web/app.js
node --check web/auth.js
```
