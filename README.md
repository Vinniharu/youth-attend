# Pulse: youth attendance PWA

Records Sunday youth service attendance using server-verified geofencing (PostGIS), with a QR fallback (one code per service, guarded by the geofence), automated absence emails, and a pastoral follow-up dashboard.

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
npm run db:migrate
npm run db:seed       # 1 admin, 20 members, 3 past Sundays
npm run dev            # http://localhost:3000
curl localhost:3000/api/health   # {"db":"ok","postgis":"3.6.x"}
```

**Signing in:** open `/login` and enter `SEED_ADMIN_EMAIL` (or any seeded member, e.g. `tobi.adeyemi@example.com`). Without `RESEND_API_KEY`, the 6-digit code is printed in the dev server console instead of emailed. With a key, emails go out through Resend from `EMAIL_FROM`, which must use a domain verified in your Resend account.

Design reference: `http://localhost:3000/styleguide` (dev only).

**Full stack in Docker** (migrations run automatically in a one-shot `migrate` service)

```bash
docker compose up --build
```

**Production:** see [`docs/DEPLOY.md`](docs/DEPLOY.md), or [`docs/DEPLOY-SHARED.md`](docs/DEPLOY-SHARED.md) for a server shared with other sites (Caddy HTTPS, Resend, backups, first leader, on-site dry run).

## Scripts

| Script                      | Purpose                                             |
| --------------------------- | --------------------------------------------------- |
| `dev`                       | Next.js dev server (Turbopack)                      |
| `build` / `start`           | Production build / start                            |
| `lint` / `lint:fix`         | ESLint                                              |
| `format` / `format:check`   | Prettier                                            |
| `typecheck`                 | Route type generation + `tsc --noEmit`              |
| `test` / `test:watch`       | Vitest unit tests                                   |
| `test:integration`          | Vitest integration tests (needs the Docker DB)      |
| `test:e2e`                  | Playwright                                          |
| `db:migrate` / `db:seed`    | Apply migrations / seed demo data                   |
| `db:reset`                  | Dev only: drop, migrate and re-seed                 |
| `db:generate` / `db:studio` | New migration / Drizzle Studio                      |
| `icons`                     | Regenerate favicon and app icons from the RCCG logo |

A Husky pre-commit hook runs ESLint and Prettier on staged files.

## License

Private. All rights reserved.
