# Youth Attendance PWA

Records Sunday youth service attendance using server-verified geofencing (PostGIS), with a rotating QR fallback, automated absence emails, and a pastoral follow-up dashboard.

**Stack:** Next.js 16 · React 19 · Tailwind v4 + shadcn/ui · PostgreSQL 18 + PostGIS 3.6 · Drizzle · Better Auth (email OTP) · Serwist · Docker.

See [`CLAUDE.md`](./CLAUDE.md) for the full design, schema, API and build roadmap.

## Getting started

Prerequisites: Docker with Compose v2, Node.js 22 LTS.

```bash
cp .env.example .env
# Fill in the secrets (openssl rand -base64 32); DB_PASSWORD must be URL-safe
# (openssl rand -hex 24) and match the password inside DATABASE_URL.
# If ports 5432/3000 are taken, set DB_PORT / APP_PORT (and update DATABASE_URL).
```

**Development (recommended): database in Docker, app on host**

```bash
docker compose up -d db
npm install
npm run dev            # http://localhost:3000
curl localhost:3000/api/health   # {"db":"ok","postgis":"3.6.x"}
```

**Full stack in Docker**

```bash
docker compose up --build
```

## Scripts

| Script                    | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| `dev`                     | Next.js dev server (Turbopack)                 |
| `build` / `start`         | Production build / start                       |
| `lint` / `lint:fix`       | ESLint                                         |
| `format` / `format:check` | Prettier                                       |
| `typecheck`               | Route type generation + `tsc --noEmit`         |
| `test` / `test:watch`     | Vitest unit tests                              |
| `test:integration`        | Vitest integration tests (needs the Docker DB) |
| `test:e2e`                | Playwright                                     |

A Husky pre-commit hook runs ESLint and Prettier on staged files.

## License

Private. All rights reserved.
