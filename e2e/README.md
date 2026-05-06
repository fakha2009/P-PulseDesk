# PulseDesk E2E Tests

Playwright tests are intentionally opt-in because they need a running backend and an isolated database.

Recommended local setup:

1. Create a disposable PostgreSQL database.
2. Set backend env for that database, plus a non-production `JWT_SECRET`.
3. Start the Go server:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/pulsedesk_e2e?sslmode=disable'
$env:JWT_SECRET='replace_with_a_32_character_test_secret'
$env:UPLOAD_ROOT='uploads-e2e'
go run ./cmd/app
```

4. In another terminal run:

```powershell
$env:PULSEDESK_E2E='1'
$env:E2E_BASE_URL='http://127.0.0.1:8082'
npm run test:e2e
```

The tests create unique users and test data. Do not point them at production.
