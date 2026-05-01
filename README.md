# ⚡ PulseDesk

<div align="center">

### Production-ready productivity platform

**Tasks · Calendar · Habits · Sleep Tracking · Admin Analytics · PostgreSQL · Go API**

<br />

![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Gin](https://img.shields.io/badge/Gin-HTTP_Framework-00ADD8?style=for-the-badge)
![JWT](https://img.shields.io/badge/Auth-JWT-black?style=for-the-badge&logo=jsonwebtokens)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel)

<br />

**PulseDesk** is a complete personal productivity system with real backend architecture, PostgreSQL persistence, secure authentication, calendar planning, focus tools, admin analytics, and a responsive frontend.

<br />

🌐 **Live Production**

https://web-three-steel-59.vercel.app

</div>

---

## 🚀 Overview

**PulseDesk** is not a localStorage demo and not a fake portfolio CRUD app.

It is a deployable full-stack productivity platform built around a real Go backend, PostgreSQL database, JWT authentication, role-based access control, database migrations, seeded demo data, health checks, and Vercel-ready serverless routing.

The application includes:

| Module | Description |
|---|---|
| ✅ Tasks | Create, edit, delete, search, filter, prioritize, sort, and complete tasks |
| 📅 Calendar | Plan tasks by day with due dates, due times, and upcoming deadlines |
| 🧩 Checklists | Add subtasks/checklist items inside every task |
| 🔁 Recurring Tasks | Daily, weekly, and monthly repeating tasks |
| ⏱️ Focus Tools | Pomodoro timer per task and deadline reminders |
| 🔁 Habits | Track daily habits, streaks, weekly rate, monthly rate, and dashboard previews |
| 😴 Sleep | Configure sleep goals, log sleep, calculate duration, quality, and weekly statistics |
| 🔐 Authentication | Register, login, JWT sessions, password hashing, profile update, password change |
| 🛡️ Admin Panel | Protected admin API, system stats, user table, role management |
| 🗄️ Database | Supabase PostgreSQL using `database/sql` with the `pgx` driver |
| ☁️ Deployment | Static frontend plus Go serverless API on Vercel |

---

## ✨ Why PulseDesk Is Solid

| Feature | Implementation |
|---|---|
| ⚙️ Real backend | Go 1.25, Gin, `database/sql`, `pgx` PostgreSQL driver |
| 🗄️ Real database | Supabase PostgreSQL through `DATABASE_URL`, no Supabase SDK lock-in |
| 🔐 Secure auth | bcrypt password hashes, JWT sessions, protected routes |
| 🧑‍💼 Role-based access | User/admin roles with middleware-level protection |
| 📊 Admin analytics | Real PostgreSQL-backed project metrics |
| 📅 Calendar planning | Dedicated calendar view backed by real task deadlines |
| 🧩 Task checklists | PostgreSQL-backed subtasks with completion state |
| 🧲 Drag-and-drop ordering | Persisted task ordering through backend reorder API |
| ⏱️ Focus workflow | Pomodoro timer and browser/PWA reminders |
| 🔁 Idempotent seed | Migrations and seed can run repeatedly without duplicate demo users |
| ☁️ Vercel-ready | Static frontend with serverless Go API via `api/index.go` |
| 🧱 Clean architecture | Handlers, services, repositories, middleware, models, utils |
| 🔒 Secret-safe frontend | No database password, JWT secret, Supabase service role key, or backend secret exposed |

---

## 🧠 Core Features

### 🔐 Authentication

PulseDesk includes a complete authentication flow:

| Capability | Status |
|---|---:|
| User registration | ✅ |
| Login | ✅ |
| Logout | ✅ |
| Current user endpoint | ✅ |
| Profile update | ✅ |
| Password change | ✅ |
| JWT protected routes | ✅ |
| Admin-only routes | ✅ |
| bcrypt password hashing | ✅ |

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

> `password_hash` never leaves the backend.

---

### ✅ Tasks

The task module is designed for daily productivity usage.

| Feature | Description |
|---|---|
| Create tasks | Add new tasks with title, description, priority, due date, and due time |
| Edit tasks | Update task content and metadata |
| Delete tasks | Remove tasks safely |
| Toggle completion | Mark tasks as complete or active |
| Quick filters | All, active, completed, today, tomorrow, this week, overdue |
| Search | Search by title and description |
| Priority levels | Low, medium, high |
| Recurring tasks | Repeat daily, weekly, or monthly |
| Checklists | Add and complete subtasks inside a task |
| Drag-and-drop | Reorder tasks and persist the order in PostgreSQL |
| Deadline reminders | Browser/PWA reminder close to the due time |
| Pomodoro | Start a 25-minute focus timer from any task |
| Dashboard cards | Counters and quick task insights |

---

### 📅 Calendar

The calendar view turns tasks into an actual plan instead of a flat list.

| Feature | Description |
|---|---|
| 14-day overview | Shows upcoming task days at a glance |
| Time-aware deadlines | Displays each task with local due time |
| Inline task access | Click a task from the calendar to edit it |
| Today highlight | Current day is visually marked |
| Real backend data | Calendar reads the same PostgreSQL-backed tasks API |

---

### ⏱️ Focus And Notifications

PulseDesk includes lightweight focus tooling directly in the task workflow.

| Feature | Description |
|---|---|
| Pomodoro timer | 25-minute task timer with live document title countdown |
| Task reminder | Notification near the deadline when permission is granted |
| Service worker | Handles notification clicks and routes back into the app |
| PWA-friendly | Works as a browser/PWA reminder layer without exposing secrets |

> Full server-originated Web Push while every tab is closed requires a dedicated VAPID/subscription sender. PulseDesk already includes the service worker foundation for the client side.

---

### 🔁 Habits

Habit tracking is more than basic CRUD.

| Feature | Description |
|---|---|
| Create habits | Add personal habits |
| Edit habits | Update habit names and settings |
| Delete habits | Remove habits |
| Daily check-in | Mark or unmark habit completion |
| Color coding | Visual habit separation |
| Current streak | Track ongoing consistency |
| Weekly rate | Analyze weekly performance |
| Monthly rate | Analyze monthly consistency |
| Dashboard preview | Show habit progress on the main page |

---

### 😴 Sleep Tracking

Sleep is treated as a first-class productivity metric.

| Feature | Description |
|---|---|
| Target bedtime | Configure preferred sleep time |
| Target wake time | Configure wake-up goal |
| Sleep logs | Store daily sleep records |
| Duration calculation | Automatically calculate sleep length |
| Sleep quality | Poor, normal, great |
| Weekly stats | Analyze sleep over the week |
| Best/worst day | Highlight sleep extremes |
| Recommendations | Suggestions based on sleep regularity |

---

### 🛡️ Admin Panel

Admins can access PostgreSQL-backed system metrics.

| Metric | Description |
|---|---|
| Total users | Full user count |
| New users today | Daily growth |
| Total tasks | All created tasks |
| Completed tasks | Finished task count |
| Total habits | All created habits |
| Sleep logs | Full sleep record count |
| 7-day activity | Recent activity overview |
| User summary | Tasks, habits, and sleep logs per user |

Regular users receive:

```http
403 Forbidden
```

on protected admin endpoints:

```text
/api/admin/*
```

---

## 🏗️ Architecture

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

The same backend logic is used in both modes:

| Mode | Entrypoint |
|---|---|
| Local/server mode | `go run ./cmd/app` |
| Vercel serverless mode | `api/index.go` |

---

## 🗄️ Database

PulseDesk uses PostgreSQL tables for:

| Table | Purpose |
|---|---|
| `users` | Accounts, roles, password hashes |
| `tasks` | User tasks |
| `task_subtasks` | Checklist items inside tasks |
| `habits` | User habits |
| `habit_checks` | Daily habit completion records |
| `sleep_settings` | User sleep goals |
| `sleep_logs` | Sleep tracking records |

PostgreSQL-specific implementation details:

| Feature | Usage |
|---|---|
| `BIGSERIAL` | Primary keys |
| `TIMESTAMPTZ` | Time-aware timestamps |
| `TEXT CHECK (...)` | Lightweight enum-like constraints |
| `ON CONFLICT` | Safe idempotent inserts |
| `INSERT ... RETURNING id` | Clean insert flow |
| `CREATE INDEX IF NOT EXISTS` | Repeatable migrations |
| `ON DELETE CASCADE` | Deletes task checklists with their parent task |

Supabase pooler compatibility is handled through pgx simple protocol mode when needed.

---

## ⚙️ Environment

### Production Backend

```env
APP_ENV=production
PORT=8080
DATABASE_URL=postgres://USER:PASSWORD@HOST:6543/postgres?sslmode=require
JWT_SECRET=change_this_secret_key_please_use_a_strong_random_string
CORS_ORIGIN=https://your-vercel-domain.vercel.app
```

### Local Fallback

If `DATABASE_URL` is not provided, local `DB_*` settings are used:

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

### Environment Rules

| Rule | Behavior |
|---|---|
| `DATABASE_URL` exists | `DB_*` variables are ignored |
| `JWT_SECRET` length | Must be at least 32 characters |
| Frontend secrets | Never expose backend secrets to frontend |
| Production CORS | Should match the deployed frontend origin |

Never expose these values in frontend code:

```text
DATABASE_URL
POSTGRES_PASSWORD
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
```

---

## 🧪 Local Development

```bash
cp .env.example .env
go mod tidy
go run ./cmd/app
```

Open:

```text
http://localhost:8082
```

---

## 👤 Seed Accounts

Seed data is idempotent and stores passwords as bcrypt hashes.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@pulsedesk.local` | `admin12345` |
| Demo User | `demo@example.com` | `password123` |

---

## 📡 API Overview

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/auth/me` | Get current user |
| `PUT` | `/api/auth/me` | Update profile |
| `PUT` | `/api/auth/password` | Change password |
| `POST` | `/api/auth/logout` | Logout |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | List tasks |
| `POST` | `/api/tasks` | Create task |
| `PATCH` | `/api/tasks/reorder` | Persist drag-and-drop task order |
| `GET` | `/api/tasks/:id` | Get task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `PATCH` | `/api/tasks/:id/toggle` | Toggle completion |
| `PATCH` | `/api/tasks/:id/subtasks/:subtaskID/toggle` | Toggle checklist item |

Task filters support:

```text
?status=all
?status=active
?status=completed
?status=today
?status=tomorrow
?status=week
?status=overdue
```

### Habits

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/habits` | List habits |
| `POST` | `/api/habits` | Create habit |
| `GET` | `/api/habits/:id` | Get habit |
| `PUT` | `/api/habits/:id` | Update habit |
| `DELETE` | `/api/habits/:id` | Delete habit |
| `PATCH` | `/api/habits/:id/check` | Toggle daily check |

### Sleep

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sleep/settings` | Get sleep settings |
| `PUT` | `/api/sleep/settings` | Update sleep settings |
| `GET` | `/api/sleep/logs` | List sleep logs |
| `POST` | `/api/sleep/logs` | Create sleep log |
| `PUT` | `/api/sleep/logs/:id` | Update sleep log |
| `DELETE` | `/api/sleep/logs/:id` | Delete sleep log |
| `GET` | `/api/sleep/stats` | Get sleep statistics |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/stats` | Project statistics |
| `GET` | `/api/admin/users` | User table |
| `PATCH` | `/api/admin/users/:id/role` | Update user role |

For all protected endpoints:

```http
Authorization: Bearer TOKEN
```

---

## 🫀 Health Check

```bash
curl https://your-domain.example.com/api/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "ok",
  "environment": "production"
}
```

---

## ☁️ Deployment

### Vercel

This repository supports single-project Vercel deployment:

| Part | Source |
|---|---|
| Frontend | `web/` |
| API | `api/index.go` |
| Routing | `vercel.json` |
| Build script | root `package.json` |

Required Vercel production environment:

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

### Render / Railway / Fly.io

The same backend can run as a long-running Go server:

```bash
go build -o app ./cmd/app
./app
```

Set:

```env
PORT
DATABASE_URL
JWT_SECRET
CORS_ORIGIN
```

---

## 🌐 Frontend API Resolution

All frontend requests go through:

```js
PulseDeskAPI.apiFetch
```

API base priority:

| Priority | Source |
|---:|---|
| 1 | `window.__API_BASE_URL__` |
| 2 | `window.PULSEDESK_CONFIG.API_BASE_URL` |
| 3 | `<meta name="api-base-url" content="...">` |
| 4 | `window.PULSEDESK_API_BASE_URL` / `window.API_BASE_URL` |
| 5 | Same-origin fallback |
| 6 | `http://localhost:8082` only when opened through `file:` |

`apiFetch` handles:

| Feature | Status |
|---|---:|
| JSON content type | ✅ |
| Bearer token injection | ✅ |
| `401` cleanup | ✅ |
| Redirect to `/auth` | ✅ |
| No fake localStorage backend | ✅ |

---

## ✅ Verification

Backend:

```bash
go mod tidy
go test ./...
go build -o app.exe ./cmd/app
```

Frontend syntax checks:

```bash
node --check web/app.js
node --check web/auth.js
node --check web/api-config.js
node --check web/sw.js
```

Smoke checks used during deployment:

| Check | Expected |
|---|---|
| `/api/health` | OK |
| Register | OK |
| Login | OK |
| `/api/auth/me` | Returns safe user data |
| Create/delete task | OK |
| Recurring task with checklist | OK |
| Toggle checklist item | OK |
| Drag-and-drop reorder API | OK |
| Calendar/app service worker files | OK |
| Regular user admin access | `403 Forbidden` |
| Admin login | OK |
| Admin stats | OK |
| Auth/app pages | `200 OK` |
| Frontend files | Correct UTF-8 |
| Service worker syntax | OK |

---

## 🔒 Security Notes

| Area | Rule |
|---|---|
| Passwords | Stored as bcrypt hashes |
| JWT secret | Backend only |
| Supabase service role key | Not used by frontend |
| `DATABASE_URL` | Backend only |
| `.env` files | Ignored by Git |
| `.vercel` files | Ignored by Git |
| Local binaries | Ignored by Git |
| Connection logs | Show source labels, not full connection strings |

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.25 |
| HTTP router | Gin |
| Database | Supabase PostgreSQL |
| SQL access | `database/sql` |
| PostgreSQL driver | `github.com/jackc/pgx/v5/stdlib` |
| Auth | JWT + bcrypt |
| Frontend | Static HTML/CSS/JS |
| PWA layer | Service Worker |
| Deployment | Vercel |
| Architecture | Handler → Service → Repository |

---

## 🏁 Final Note

PulseDesk is compact, but it handles the boring production details many demo apps skip:

- real database migrations
- real authentication
- protected admin routes
- role-based access
- deployment configuration
- API routing
- frontend API resolution
- secret isolation
- smoke testing
- PostgreSQL-backed analytics
- time-aware calendar planning
- recurring tasks
- task checklists
- drag-and-drop ordering
- Pomodoro focus timer
- service-worker notification handling

It is built like a real application, not a throwaway prototype.

---

<div align="center">

### ⚡ PulseDesk

**A serious productivity system with a real backend behind it.**

</div>
