@AGENTS.md

# Youth Attendance PWA: project guide for Claude

A PWA that records Sunday youth service attendance using server-verified geofencing (PostGIS), a rotating QR fallback, an automated absence-email engine, and a pastoral follow-up dashboard. One Next.js 16 codebase (UI + API), PostgreSQL 18 + PostGIS 3.6, all in Docker.

## Current status

- **Phase 0 (scaffold & infrastructure): done.** Full `docker compose up --build` verified (db → migrate → app, health ok).
- **Phase 1 (database layer + Pulse design foundation): done.** Schema, migrations, seed, `lib/geo.ts` with unit + PostGIS integration tests, design tokens, `/styleguide`.
- **Phase 2 (auth & roles): done.** Better Auth email OTP (no open sign-up), 60-day sliding sessions, `proxy.ts` + data access layer, login page, Brevo email.
- **Phase 3 (admin geofence & sessions): done.** Map picker at `/admin/geofence`, sessions at `/admin/sessions`, `GET/PUT /api/admin/location`, `GET/POST /api/admin/sessions`, `PATCH /api/admin/sessions/:id`.
- **Phase 4 (geofence check-in): done.** `POST /api/checkin/geofence`, `GET /api/sessions/current`, member home check-in card, Playwright suite (`tests/e2e`).
- **Phase 5 (PWA): done.** Service worker (`public/sw.js`, built after `next build`), offline page, install prompts (Android button, iPhone steps). Chrome reports no installability errors; manual install on real phones is still to be checked.
- **Phase 6 (QR fallback): done.** Rotating tokens, projector display, `/scan` (camera or phone-camera link), relaxed-location QR check-in, admin manual check-in, session detail page.
- **Next: Phase 7 (absence engine & emails).**
- **Email provider is Brevo, not Resend** (the user's choice). Everywhere the spec below says Resend, read Brevo.
- Work one phase per session and stop at the phase's done-when check. Commit after each phase.

## Ground rules

- **Read the bundled Next.js docs** in `node_modules/next/dist/docs/` before writing Next-specific code. This is Next 16.4 with `cacheComponents` and `partialPrefetching` enabled, so request-time route handlers must call `await connection()` (see `src/app/api/health/route.ts`).
- Check current docs for Serwist, Better Auth and Drizzle before wiring them up; they move quickly.
- Every dependency for the whole roadmap is already installed. Don't add new ones without a reason.
- Never install with `--force` or `--legacy-peer-deps`.

## Conventions

- Code lives in `src/`; import alias `@/*` points to `src/*`.
- **Server-only code:** add `import "server-only"` to app-layer server modules (`lib/auth.ts`, `lib/email.ts`, …). **Exception:** `src/db/client.ts` must stay importable from plain Node (tsx scripts, Vitest), so it has no `server-only` import.
- DB access goes through `getDb()` from `@/db/client` (lazy pool, so `next build` needs no database).
- Validate every API input with Zod at the boundary. Never trust client-side geofence decisions.
- API errors: log details server-side, return a generic body to the client.
- UI: shadcn/ui (Radix base, `radix-nova` style) in `src/components/ui`; `cn()` comes from the `cn` package (via `@/lib/utils`); toasts via `sonner`; theming via `next-themes` (class strategy).
- Email templates use `react-email` (v6 ships the components and `render`; don't add `@react-email/components`).
- Formatting: Prettier (with the Tailwind class-sorting plugin). Linting: ESLint flat config (`eslint-config-next` + `eslint-config-prettier`). A Husky pre-commit hook runs lint-staged.

## Auth

- Config: `src/lib/auth.ts` (`getAuth()`, lazy). Browser client: `src/lib/auth-client.ts`. Handler: `src/app/api/auth/[...all]/route.ts`.
- **Every page and route handler checks auth itself** via the DAL in `src/lib/dal.ts`:
  - pages: `requireUser()` / `requireAdmin()` (redirects), called inside a `<Suspense>` boundary (Cache Components);
  - route handlers: `const auth = await authorizeApi("admin"); if (!auth.ok) return auth.response;` (401/403 JSON).
  - `src/proxy.ts` is only an optimistic cookie check for pages; it never sees roles. A layout check alone is not protection.
  - `src/app/admin/layout.tsx` sets `export const instant = false` and awaits `requireAdmin()` outside Suspense, so members receive no admin markup, just the redirect (a 307 in dev; in production a 200 page carrying it, since the root static shell has already flushed). A redirect inside Suspense also trips Next's dev instant-validation. Admin pages still call `requireAdmin()` themselves.
- Email OTP: `disableSignUp` (admins add members; unknown emails get a silent success), 6 digits, 10 minutes, 5 attempts, stored hashed. In development the code is printed to the server console (`[auth] sign-in code for …`); never in production.
- `role` and `isActive` are Better Auth `additionalFields` with `input: false`, so `/update-user` can't change them. Inactive users get no code and can't create a session (`databaseHooks.session.create.before`); existing sessions stop working because the DAL checks `isActive` on every request (cookie cache is off on purpose).
- Auth tables (`session`, `account`, `verification`) are hand-written in `schema.ts` to match Better Auth 1.7 (the CLI isn't installed). TS keys must stay Better Auth's field names. `verification.id` is `text`: Better Auth writes non-UUID ids there.
- `BETTER_AUTH_URL` must match the origin the browser uses; extra origins (Docker on `APP_PORT`, Playwright) go in `BETTER_AUTH_TRUSTED_ORIGINS`.
- Post-login redirects go through `safeRedirectPath()` (`src/lib/safe-redirect.ts`).
- Better Auth rate limits only in production, per IP (`x-forwarded-for`). Email-OTP endpoints allow 20/min per IP (the default 3/min would block a group on one church Wi-Fi). **Phase 9:** behind Caddy, set `advanced.ipAddress.trustedProxies` so the client IP (not Caddy's) is the key.

## Geofence & sessions

- Server logic lives in `src/lib/location.ts` (`getDefaultLocation`, `saveDefaultLocation`: one atomic upsert on the `one_default_location` index) and `src/lib/sessions.ts` (`createSession`, `listSessions`, `updateSession`). Route handlers stay thin: `authorizeApi("admin")`, `parseBody(request, schema)` and `apiError` from `src/lib/api.ts`.
- Input schemas are client-safe in `src/lib/schemas.ts` (also home of `pointSchema`); forms and routes share them. Browser calls go through `sendJson()` in `src/lib/api-client.ts`, which maps error codes to user-facing messages.
- A session copies the default location's centre and radius when created; later geofence edits never touch existing sessions. Windows are entered as church-local `HH:mm` and converted with `zonedDateTimeToUtc` on the session's own date.
- Admin status changes: scheduled → open | cancelled; open → closed | cancelled; closed → open | cancelled; cancelled → scheduled ("Restore"; the date is unique, so an accidental cancel must be recoverable). Only `processed` (set by the absence engine) is final (`LOCKED`). `SessionSummary` never includes `qrSecret`.
- `listSessions(today)` returns `{ upcoming, past }`: all upcoming sessions (so the next free Sunday is always right) and the latest 26 past ones. Counts are correlated subqueries; the outer `"service_sessions"."id"` is written out because Drizzle would render a bare `id` that binds to the inner table.
- Env defaults (`APP_TIMEZONE`, `DEFAULT_SERVICE_START`/`END`) live only in `src/lib/config.ts` (`appTimeZone()`, `defaultServiceWindow()`).
- Map: `GeofencePicker` loads `geofence-map.tsx` via `next/dynamic` with `ssr: false`. The marker is a `divIcon` (no broken default PNGs); circle colours come from `.geofence-circle` in `globals.css` (SVG attributes can't read CSS variables). Dark mode inverts OSM tiles.
- Nominatim: search on submit only (its policy forbids as-you-type autocomplete), throttled to 1 request/second, with attribution.
- Pages under `/admin` still wrap data reads in `<Suspense>`; the layout's `instant = false` doesn't exempt them from Next's dev check.

## Check-in

- Pipeline: `src/lib/checkin.ts` (`checkInWithGeofence`). The route handler does auth (401 → `{ok:false, reason:"UNAUTHENTICATED"}`), the rate limit (5 per member per 5 min, `src/lib/rate-limit.ts`, in-memory), then Zod (`checkinInput`). Expected outcomes are 200 with `ok: false`.
- Order deliberately differs from the spec list: open session → **already checked in** → accuracy (`maxAccuracyM()`, `MAX_ACCURACY_M`) → distance → insert (`ON CONFLICT DO NOTHING`). A member already counted sees "checked in" even if they reopen the app at home or with weak GPS.
- Shapes shared with the UI live in `src/lib/checkin-types.ts` (client-safe). `src/lib/member-status.ts` serves the member home: `getMemberStatus` (open session + my check-in, else the next session) and `getRecentSundays` (pulse line; excused and pre-joining Sundays left out).
- UI: `src/components/checkin/checkin-card.tsx`. Auto-runs on load when a session is open and I'm not checked in; on `visibilitychange` it refreshes the status and retries at most every 45 s (protects the rate limit). Requests time out after 20 s. "Scan QR instead" links to `/scan` (placeholder until Phase 6).
- E2E: `npm run test:e2e` builds and starts the app (`next build && next start`, port 3100; not `next dev`, since Next 16 allows one dev server per project) against a separate `attendance_e2e` database, created, migrated and reset by `tests/e2e/global-setup.ts`. Specs sign in by planting a code (`plantSignInCode`, tied to Better Auth's hashed-OTP format) and posting it to `/api/auth/sign-in/email-otp`; nothing is emailed. Set `E2E_CHANNEL=chrome` to use the installed Chrome instead of downloading Playwright's Chromium.

## PWA

- **Service worker:** source `src/app/sw.ts`; `scripts/build-sw.mjs` runs after `next build` (`npm run build`), computes the precache list from the build output, and bundles it into `public/sw.js` (git-ignored).
  - Not the Serwist Turbopack route handler: with `cacheComponents` its `force-static` export is rejected, so it would bundle at runtime, which fails in the standalone Docker image.
- **Caching is deliberately narrow:**
  - Precache: the CSS, the preloaded latin fonts (`-s.p.` woff2), `public/icons/*`, and `/offline` (revision = build ID); about 250 KB.
  - Runtime: `/_next/static/*` CacheFirst; `/_next/image` and icons StaleWhileRevalidate.
  - Navigations: NetworkOnly, falling back to `/offline`.
  - **Pages and `/api` are never cached** (per-member and time-sensitive).
- **Registration:** `SerwistProvider` (`@serwist/turbopack/react`) in `src/app/layout.tsx`, production only, `cacheOnNavigation={false}`, `reloadOnOnline={false}` (an app-wide reload would discard half-typed codes and unsaved forms; only `/offline` reloads itself, via `ReloadWhenOnline`). In development `DevServiceWorkerReset` unregisters any worker left by a production run. `/sw.js` is served `no-cache` (`next.config.ts`).
- **Types:** the worker type-checks on its own (`tsconfig.sw.json`, WebWorker lib) and is excluded from the app `tsconfig.json`; `npm run typecheck` runs both. `public/sw.js` is ignored by ESLint and Prettier.
- **`src/proxy.ts`:** the matcher skips `/sw.js` (anchored, `sw\.js$`); `/offline` is public via `PUBLIC_PAGES`. The offline page is static, uses a text wordmark (the badge image may not be cached) and works without JS; its "Try again" is a plain `<a>` (a full page load lets the worker decide).
- **Install prompt:** `src/components/pwa/install-prompt.tsx`, on the member home.
  - Android/Chrome: holds `beforeinstallprompt` and shows an Install button.
  - iOS: Share → Add to Home Screen steps.
  - Hidden when standalone; "Not now" snoozes it for 14 days (localStorage).
- **Lighthouse 12+ has no PWA category.** The installability check is Chrome's own (`Page.getInstallabilityErrors` over CDP), run from a non-incognito profile.

## QR fallback

- Tokens: `src/lib/qr-token.ts` (server, HMAC per spec; valid in their window and the next, so a photo dies within ~60 s; non-canonical base64url signatures rejected). Client-safe shape/link helpers in `src/lib/qr-link.ts`.
- The code encodes a link, `APP_URL/scan?t=<token>` (`appUrl()`), so a phone's own camera app opens Pulse at check-in. `/scan` drops `t` from the address bar after reading it.
- Display: `/admin/sessions/[id]/display` (`QrDisplay`, full-screen overlay) polls `GET /api/admin/sessions/:id/qr-token` every 10 s and right after each window, corrects for clock skew, keeps the screen awake (Wake Lock), shows a live count.
- **QR location rule (user's choice: relaxed):** `checkInWithQr` accepts accuracy up to `QR_MAX_ACCURACY_M` (default 2 × `MAX_ACCURACY_M` = 150 m) and counts the member inside when distance ≤ radius + accuracy. Forwarded codes used far away still fail.
- One shared rate limiter (`checkinLimiter`, on `globalThis`) for both check-in routes.
- Manual check-in: `POST /api/admin/attendance` (`recordManualCheckIn`), allowed for scheduled/open/closed sessions only (processed would leave streaks wrong). The session page lists every active member not checked in or excused, including people added on the day.
- Scanner: `@yudiel/react-qr-scanner`, client-only. Its zxing decoder is **self-hosted** at `public/vendor/zxing_reader-<version>.wasm` (the library otherwise fetches it from a CDN); `tests/unit/zxing-wasm.test.ts` fails if the installed `zxing-wasm` version moves without refreshing that copy.
- Check-in screens shared by the home card and the scanner live in `src/components/checkin/checkin-views.tsx` (`ViewBody`, `submitCheckin`, `readPosition`).

## Email (Brevo)

- `src/lib/email.ts`: `sendEmail()` posts to Brevo's `POST /v3/smtp/email` with plain `fetch` (no SDK). Sender comes from `EMAIL_FROM` (must be a verified Brevo sender).
- Without `BREVO_API_KEY`: skipped in development, an error in production. Integration tests force it empty.
- Templates live in `src/emails/` (react-email v6: `render` + `toPlainText`; send HTML and text).
- Exception to the no-raw-hex rule: email clients ignore CSS variables, so templates inline Pulse hex values. Keep them in sync with `globals.css`.
- In production, requesting a sign-in code fails (500, logged) without `BREVO_API_KEY` and a valid `EMAIL_FROM` (`assertEmailConfig()`); existing sessions keep working. The Docker stack runs NODE_ENV=production, so it needs both before anyone new can sign in.
- Sliding sessions: the DAL reads sessions with `disableRefresh` (Server Components can't set cookies); `<SessionKeepAlive />` in the root layout refreshes DB expiry and cookie together via `/api/auth/get-session`.
- Phase 7 batching: use Brevo `messageVersions` (≤ 99 recipients per version, ≤ 2000 per request) or one request per member. `notifications_log.provider_message_id` stores Brevo's `messageId`.

## Database

- Schema: `src/db/schema.ts` (snake_case columns, camelCase TS fields). Custom types in `src/db/types.ts`: `geographyPoint` (`{ lat, lng }` ↔ `geography(Point, 4326)`) and `citext`.
- **Longitude-first lives in one place:** `pointSql()` in `src/db/point.ts`. Never write `ST_MakePoint` anywhere else.
- Migrations live in `src/db/migrations`. `0000_extensions.sql` is hand-written (postgis, citext). drizzle-kit quotes custom types; `npm run db:generate` runs `scripts/fix-migrations.mjs` afterwards to unquote `geography(...)`. To name a migration: `npx drizzle-kit generate --name <name> && node scripts/fix-migrations.mjs`.
- Docker: migrations run in a one-shot `migrate` compose service (Dockerfile `migrator` stage, no Next build). `app` starts only after it succeeds. This replaces the spec's "entrypoint runs migrations".
- Integration tests use a separate `<db>_test` database (`tests/integration/test-db-url.mjs`); `truncateAll()` refuses to run on anything else. Never point tests at the dev DB.
- `db:seed`/`db:reset` only run against local hosts (`scripts/guard.ts`; override with `ALLOW_DESTRUCTIVE_DB_SCRIPTS=1`).
- The seed (`scripts/seed.ts`) is deterministic and transactional: 1 admin (`SEED_ADMIN_EMAIL`), 20 members, 3 processed Sundays, 1 flagged member with an open follow-up.

## Design system ("Pulse")

- App name **Pulse**. Clean & premium, ocean blue. Tokens in `src/app/globals.css` (light + dark); every text pair meets WCAG AA.
- Colours: Ocean `#0B6BCB` primary; `success` (emerald) **only** for checked-in states; `warning` (amber) sparingly. Use semantic classes (`bg-primary`, `text-muted-foreground`, `bg-success-soft`), never raw hex in components.
- Type: Bricolage Grotesque for headings (`font-heading`, applied to h1–h3 automatically), Geist for UI. Add `tabular` to numbers and times.
- Signature motif: `<PulseLine beats={…} />` (attendance as a heartbeat). It's the one expressive element; keep everything around it quiet.
- Brand mark: the **RCCG badge** (the user's church). `<Logo />` = `<ChurchMark />` + the "Pulse" wordmark, in `src/components/brand/logo.tsx`; the app is still called Pulse. Never crop, recolour or stretch the badge. `<StatusDot />` for live states.
- Icons: master at `src/assets/brand/rccg-logo.png` (not in `public/`). `npm run icons` (`scripts/generate-icons.mjs`, sharp) writes `src/app/favicon.ico`, `src/app/icon.png`, `src/app/apple-icon.png` (opaque white: iOS fills transparency with black) and `public/icons/` (manifest `any` + `maskable` on white, badge inside the 80% safe zone). Commit the outputs.
- Install metadata: `src/app/manifest.ts` and `appleWebApp` in `src/app/layout.tsx`. `src/proxy.ts` must keep `/icons/`, `/manifest.webmanifest`, `/icon*`, `/apple-icon*` and `/favicon.ico` public (phones fetch them signed out).
- Avoid: all-caps eyebrow labels, arrows appended to buttons, decorative gradients, identical card grids. Mobile-first (members use phones); left-aligned layouts.
- Reference page: `/styleguide` (dev only; 404 in production).

## Commands

| Command                             | Purpose                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                       | Dev server (Turbopack)                                               |
| `npm run build` / `start`           | Production build / start                                             |
| `npm run lint` / `lint:fix`         | ESLint (zero warnings allowed)                                       |
| `npm run format` / `format:check`   | Prettier                                                             |
| `npm run typecheck`                 | `next typegen` + `tsc --noEmit`                                      |
| `npm test` / `test:watch`           | Vitest unit tests (`tests/unit`)                                     |
| `npm run test:integration`          | Vitest integration tests against the Docker DB (`tests/integration`) |
| `npm run test:e2e`                  | Playwright (`tests/e2e`)                                             |
| `npm run db:migrate` / `db:seed`    | Apply migrations / seed demo data                                    |
| `npm run db:reset`                  | Dev only: drop everything, migrate, seed                             |
| `npm run db:generate` / `db:studio` | New migration from schema changes / Drizzle Studio                   |
| `docker compose up -d db`           | Dev database only (host port `DB_PORT`, loopback-only)               |
| `docker compose up --build`         | Full stack (host port `APP_PORT`)                                    |

Email and scheduler scripts (`email:dev`, `scheduler`) are added in the phases that create their files.

---

# Reference (from the project spec)

## Design Decisions & Known Limitations

**Why Serwist, not `next-pwa`:** The original `next-pwa` is unmaintained and doesn't support the App Router or Turbopack. Serwist is its maintained successor and ships a dedicated Turbopack integration.

**Why email OTP, not magic links:** On iOS, a magic link opens in Safari, which doesn't share cookies with the installed PWA, so members would stay logged out inside the app. A code typed into the app works everywhere.

**Why Drizzle, not Prisma:** Prisma has no native PostGIS geography support. Drizzle lets typed queries and raw PostGIS SQL live side by side.

**Why the QR code rotates:** A QR code valid all day can be photographed and shared. Each Sunday session still gets a fresh secret (as originally specified), but the displayed token is an HMAC of that secret plus a 30-second time window. Screenshots expire in under a minute.

**Why there's a `church_locations` table:** Admins set the geofence once. Each Sunday copies it into its session row, so moving location later doesn't rewrite history.

**Why there's no "weekly reset":** Attendance is stored per session, so there's nothing to reset. The only running state is `consecutive_absences`, which the absence job maintains.

**No background location.** PWAs can't track location in the background. Check-in happens when the member **opens** the app, or returns to it, during the service window. This is by design.

**Spoofing is reduced, not eliminated.** Server-side validation stops anyone from tampering with the frontend. It can't detect a fake-GPS app on the phone itself. Mitigations: accuracy threshold, rotating QR, one check-in per session (DB constraint), and rate limiting. That's proportionate for a youth attendance app.

**HTTPS is required.** Geolocation, camera access, and service workers only work in secure contexts. `localhost` counts as secure for development; production needs TLS (Caddy handles this).

**Indoor GPS is imprecise.** Inside buildings, accuracy is often 20–100 m. Set the radius generously (100–150 m is typical) and test with real phones before launch.

---

## Getting Started

### Prerequisites

- Docker and Docker Compose v2
- Node.js 22 LTS and npm (for running the app outside Docker in development)
- A Brevo account with an API key (a verified sender/domain is needed for production)

### 1. Clone and configure

```bash
git clone <your-repo-url> youth-attendance
cd youth-attendance
cp .env.example .env
# Fill in the values; see Environment Variables below
```

Generate secrets:

```bash
openssl rand -base64 32   # use for BETTER_AUTH_SECRET
openssl rand -base64 32   # use for CRON_SECRET
openssl rand -base64 32   # use for UNSUBSCRIBE_SECRET
```

### 2a. Development (recommended): database in Docker, app on host

```bash
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed          # 1 admin, 20 members, a church location, 3 past Sundays
npm run dev              # http://localhost:3000
```

### 2b. Full stack in Docker

```bash
docker compose up --build
```

Migrations run automatically when the app container starts.

### 3. Log in

The seed creates an admin with the email set in `SEED_ADMIN_EMAIL`. Request a code on `/login`. In development, OTP codes are also printed to the server console, so you don't need Brevo set up to log in locally.

### npm scripts

| Script            | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `dev`             | Next.js dev server (Turbopack)           |
| `build` / `start` | Production build / start                 |
| `db:generate`     | Generate a migration from schema changes |
| `db:migrate`      | Apply migrations                         |
| `db:seed`         | Seed demo data                           |
| `db:studio`       | Drizzle Studio                           |
| `email:dev`       | Preview React Email templates            |
| `test`            | Vitest                                   |
| `test:e2e`        | Playwright                               |
| `scheduler`       | Run the cron scheduler locally           |

---

## Environment Variables

> **Source of truth is `.env.example`** (it also has `DB_PORT`, `APP_PORT` and `APP_INTERNAL_URL`). The block below is the original spec for reference.

```bash
# .env.example

# Database
DB_PASSWORD=change-me
DATABASE_URL=postgres://church:change-me@localhost:5432/attendance

# Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
SEED_ADMIN_EMAIL=you@example.com

# Email (Brevo)
BREVO_API_KEY=
EMAIL_FROM="Youth Church <noreply@yourdomain.org>"
ADMIN_ALERT_EMAILS=pastor@yourdomain.org,youthlead@yourdomain.org

# Jobs and tokens
CRON_SECRET=
UNSUBSCRIBE_SECRET=
APP_URL=http://localhost:3000

# Behaviour
APP_TIMEZONE=Africa/Lagos
MAX_ACCURACY_M=75               # reject GPS readings worse than this
QR_WINDOW_SECONDS=30
ABSENCE_FLAG_THRESHOLD=3
LOCATION_RETENTION_DAYS=90      # check-in coordinates are wiped after this
DEFAULT_SERVICE_START=08:00     # local time; window opens
DEFAULT_SERVICE_END=11:30       # local time; window closes

# Production only
DOMAIN=attendance.yourdomain.org
```

---

## Project Structure

```
youth-attendance/
├── docker-compose.yml             # dev: db + app + scheduler
├── docker-compose.prod.yml        # prod overrides + caddy
├── Dockerfile                     # multi-stage, Next standalone
├── Caddyfile
├── .env.example
├── drizzle.config.ts
├── next.config.ts                 # wrapped with withSerwist()
├── scripts/
│   ├── migrate.mjs                # runs migrations at container start
│   ├── seed.ts
│   └── scheduler.mjs              # croner jobs → /api/cron/*
├── src/
│   ├── proxy.ts                   # route protection (Next 16's replacement for middleware.ts)
│   ├── app/
│   │   ├── layout.tsx             # SerwistProvider
│   │   ├── manifest.ts
│   │   ├── sw.ts                  # service worker source
│   │   ├── serwist/[path]/route.ts  # serves the compiled SW
│   │   ├── offline/page.tsx
│   │   ├── (auth)/login/page.tsx
│   │   ├── (member)/page.tsx            # home + auto check-in
│   │   ├── (member)/scan/page.tsx       # QR fallback
│   │   ├── (member)/history/page.tsx
│   │   ├── (member)/settings/page.tsx
│   │   ├── admin/page.tsx               # dashboard, follow-ups first
│   │   ├── admin/geofence/page.tsx
│   │   ├── admin/sessions/page.tsx
│   │   ├── admin/sessions/[id]/page.tsx
│   │   ├── admin/sessions/[id]/display/page.tsx   # live rotating QR
│   │   ├── admin/members/page.tsx
│   │   ├── admin/follow-ups/page.tsx
│   │   ├── unsubscribe/page.tsx
│   │   └── api/
│   │       ├── auth/[...all]/route.ts
│   │       ├── checkin/geofence/route.ts
│   │       ├── checkin/qr/route.ts
│   │       ├── sessions/current/route.ts
│   │       ├── admin/…                  # admin CRUD routes
│   │       ├── cron/create-session/route.ts
│   │       ├── cron/open-close/route.ts
│   │       ├── cron/process-absences/route.ts
│   │       ├── cron/purge-locations/route.ts
│   │       └── health/route.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── geography.ts           # Drizzle custom type
│   │   ├── client.ts
│   │   └── migrations/
│   ├── lib/
│   │   ├── auth.ts / auth-client.ts
│   │   ├── geo.ts                 # PostGIS helpers
│   │   ├── qr-token.ts            # rotating HMAC tokens
│   │   ├── absences.ts            # absence engine
│   │   ├── email.ts               # Brevo wrapper + batching
│   │   ├── rate-limit.ts
│   │   └── time.ts                # timezone helpers
│   ├── emails/
│   │   ├── LoginCode.tsx
│   │   ├── MissedYou.tsx
│   │   └── AdminFlagAlert.tsx
│   └── components/
│       ├── map/GeofencePicker.tsx # client-only (next/dynamic, ssr:false)
│       ├── checkin/CheckinCard.tsx
│       └── qr/QrScanner.tsx
└── tests/
    ├── unit/
    ├── integration/               # runs against the Docker database
    └── e2e/
```

---

## Database Schema

> Naming note: Better Auth needs its own `session` table, so the Sunday sessions table is called **`service_sessions`** to avoid confusion. The `users` table is Better Auth's user model renamed and extended with `additionalFields`. Configure Better Auth to generate UUIDs so foreign keys line up. Generate the auth tables with the Better Auth CLI, then add the app tables below.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role      AS ENUM ('member', 'admin');
CREATE TYPE checkin_method AS ENUM ('auto_geofence', 'qr_scan', 'manual_admin');
CREATE TYPE session_status AS ENUM ('scheduled', 'open', 'closed', 'processed', 'cancelled');
CREATE TYPE notif_type     AS ENUM ('single_absence', 'flagged_member');

-- Better Auth user model (renamed to "users") + app fields
CREATE TABLE users (
  id                    uuid PRIMARY KEY,
  name                  text NOT NULL,
  email                 citext UNIQUE NOT NULL,
  email_verified        boolean NOT NULL DEFAULT false,
  image                 text,
  phone                 text,
  role                  user_role NOT NULL DEFAULT 'member',
  email_notifications   boolean NOT NULL DEFAULT true,
  consecutive_absences  integer NOT NULL DEFAULT 0,
  is_flagged            boolean NOT NULL DEFAULT false,
  flagged_at            timestamptz,
  is_active             boolean NOT NULL DEFAULT true,
  joined_at             timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE church_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  center      geography(Point, 4326) NOT NULL,
  radius_m    integer NOT NULL CHECK (radius_m BETWEEN 20 AND 2000),
  is_default  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_default_location ON church_locations (is_default) WHERE is_default;

CREATE TABLE service_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date           date UNIQUE NOT NULL,
  starts_at              timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL CHECK (ends_at > starts_at),
  center                 geography(Point, 4326) NOT NULL,   -- copied from church_locations
  radius_m               integer NOT NULL,
  qr_secret              text NOT NULL,                     -- 32 random bytes, base64url
  status                 session_status NOT NULL DEFAULT 'scheduled',
  absences_processed_at  timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_sessions_center_gix ON service_sessions USING GIST (center);

CREATE TABLE attendance_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES service_sessions(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_in_at  timestamptz NOT NULL DEFAULT now(),
  method         checkin_method NOT NULL,
  location       geography(Point, 4326),   -- null for manual_admin; purged after retention period
  accuracy_m     real,
  distance_m     real,
  user_agent     text,
  recorded_by    uuid REFERENCES users(id), -- admin, for manual check-ins
  UNIQUE (session_id, user_id)
);

CREATE TABLE excusals (
  session_id  uuid NOT NULL REFERENCES service_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE notifications_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES service_sessions(id) ON DELETE SET NULL,
  type        notif_type NOT NULL,
  provider_message_id text,   -- Brevo messageId
  status      text NOT NULL DEFAULT 'pending',   -- pending | sent | failed | skipped
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id, type)
);

CREATE TABLE follow_ups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  streak_at_open  integer NOT NULL,
  assigned_to     uuid REFERENCES users(id),
  notes           text,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX one_open_follow_up ON follow_ups (user_id) WHERE resolved_at IS NULL;
```

---

## Core Logic

### Geofence validation (`lib/geo.ts`)

```sql
SELECT
  s.id,
  ST_Distance(s.center, ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography) AS distance_m,
  ST_DWithin(s.center, ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography, s.radius_m) AS inside
FROM service_sessions s
WHERE s.status = 'open'
  AND now() BETWEEN s.starts_at AND s.ends_at
LIMIT 1;
```

> ⚠️ `ST_MakePoint` takes **longitude first**. This is the most common PostGIS bug, and it has a dedicated unit test.

Using `geography` means all distances and radii are in real meters.

### Check-in pipeline (both methods)

1. Rate limit: 5 attempts per user per 5 minutes.
2. Zod validation: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`, `accuracy > 0`.
3. Reject if `accuracy > MAX_ACCURACY_M` with `LOW_ACCURACY` (the UI suggests stepping outside or near a window).
4. QR only: verify the rotating token.
5. Find the open session and run `ST_DWithin`.
6. `INSERT … ON CONFLICT (session_id, user_id) DO NOTHING`, then return `alreadyCheckedIn` if no row was inserted.

**Response shape**

```ts
type CheckinResult =
  | {
      ok: true;
      alreadyCheckedIn: boolean;
      checkedInAt: string;
      method: "auto_geofence" | "qr_scan";
    }
  | {
      ok: false;
      reason:
        | "NO_OPEN_SESSION"
        | "OUTSIDE_GEOFENCE"
        | "LOW_ACCURACY"
        | "INVALID_QR"
        | "EXPIRED_QR"
        | "RATE_LIMITED"
        | "UNAUTHENTICATED";
      distanceM?: number;
    };
```

### Rotating QR token (`lib/qr-token.ts`)

```
window = floor(unixSeconds / QR_WINDOW_SECONDS)
sig    = HMAC_SHA256(session.qr_secret, `${sessionId}.${window}`) → first 16 bytes, base64url
token  = `${sessionId}.${window}.${sig}`
```

- The token is accepted for the **current and previous** window, to tolerate scan delay and clock drift.
- Signatures are compared with `crypto.timingSafeEqual`.
- The display page polls `GET /api/admin/sessions/:id/qr-token` every 10 seconds and shows a countdown ring.

### Absence engine (`lib/absences.ts`)

Runs for every session with `status = 'closed'` and `absences_processed_at IS NULL`. It is **idempotent**, so running it twice is safe.

Inside **one transaction**, for each active member whose `joined_at` is before the session's `starts_at`:

| Situation                                                            | Action                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Attended                                                             | `consecutive_absences = 0`                                                               |
| Excused                                                              | No change                                                                                |
| Absent                                                               | `consecutive_absences += 1`; queue `single_absence` email if `email_notifications` is on |
| Absent and streak ≥ `ABSENCE_FLAG_THRESHOLD` and not already flagged | Set `is_flagged = true` and `flagged_at`, open a `follow_ups` row, queue an admin alert  |

Then set `absences_processed_at = now()` and `status = 'processed'`.

**After commit**, send queued emails through Brevo (`messageVersions` batches: ≤ 99 recipients per version, ≤ 2000 per request) and record `provider_message_id`, `status`, and `error` in `notifications_log`. The unique constraint on `(user_id, session_id, type)` guarantees no duplicate emails, even if the job is retried.

**Cancelled sessions** are skipped entirely.

**Returning members:** When a flagged member attends again, their streak resets to 0 automatically. Their follow-up stays open until a leader resolves it, so the pastoral conversation still happens.

### Email templates

- **LoginCode:** the 6-digit OTP, valid for 10 minutes.
- **MissedYou:** a warm, personal "we missed you" message with the member's first name and the date, plus a one-click unsubscribe link (signed with `UNSUBSCRIBE_SECRET`).
- **AdminFlagAlert:** member name, streak length, last attended date, and a link to the follow-up.

---

## API Reference

All routes return JSON. Member routes require a session. Admin routes require `role = 'admin'`. Cron routes require `Authorization: Bearer $CRON_SECRET`.

| Method                   | Route                                | Auth   | Purpose                                               |
| ------------------------ | ------------------------------------ | ------ | ----------------------------------------------------- |
| `*`                      | `/api/auth/[...all]`                 | public | Better Auth handler (OTP request/verify, session)     |
| `POST`                   | `/api/checkin/geofence`              | member | `{lat, lng, accuracy}` → `CheckinResult`              |
| `POST`                   | `/api/checkin/qr`                    | member | `{token, lat, lng, accuracy}` → `CheckinResult`       |
| `GET`                    | `/api/sessions/current`              | member | Open session info and whether the user has checked in |
| `GET`                    | `/api/me/history`                    | member | Member's attendance history                           |
| `PATCH`                  | `/api/me/preferences`                | member | `{emailNotifications}`                                |
| `GET` / `PUT`            | `/api/admin/location`                | admin  | Read or update the default geofence                   |
| `GET` / `POST`           | `/api/admin/sessions`                | admin  | List or create sessions                               |
| `PATCH`                  | `/api/admin/sessions/:id`            | admin  | Change window, status, or cancel                      |
| `GET`                    | `/api/admin/sessions/:id/qr-token`   | admin  | Current rotating token                                |
| `GET`                    | `/api/admin/sessions/:id/attendance` | admin  | Attendees, absentees, excused                         |
| `POST`                   | `/api/admin/attendance`              | admin  | Manual check-in                                       |
| `POST` / `DELETE`        | `/api/admin/excusals`                | admin  | Add or remove an excusal                              |
| `GET` / `POST` / `PATCH` | `/api/admin/members`                 | admin  | Member management                                     |
| `POST`                   | `/api/admin/members/import`          | admin  | CSV import                                            |
| `GET`                    | `/api/admin/export`                  | admin  | CSV export                                            |
| `GET` / `PATCH`          | `/api/admin/follow-ups`              | admin  | Follow-up list, notes, assign, resolve                |
| `GET`                    | `/api/admin/stats`                   | admin  | Dashboard numbers and 12-week trend                   |
| `POST`                   | `/api/cron/create-session`           | cron   | Create this Sunday's session                          |
| `POST`                   | `/api/cron/open-close`               | cron   | Open/close sessions by time window                    |
| `POST`                   | `/api/cron/process-absences`         | cron   | Run the absence engine                                |
| `POST`                   | `/api/cron/purge-locations`          | cron   | Null out coordinates older than retention             |
| `GET`                    | `/api/health`                        | public | DB and PostGIS status                                 |

---

## Scheduled Jobs

The `scheduler` service runs `scripts/scheduler.mjs` from the same Docker image. It uses `croner` with `timezone: APP_TIMEZONE`, so schedules follow local church time regardless of server timezone.

| Job                   | Schedule (local time) | Route                        |
| --------------------- | --------------------- | ---------------------------- |
| Create session        | Sunday 06:00          | `/api/cron/create-session`   |
| Open/close window     | Every 5 minutes       | `/api/cron/open-close`       |
| Process absences      | Sunday 21:00          | `/api/cron/process-absences` |
| Purge old coordinates | Daily 03:00           | `/api/cron/purge-locations`  |

```js
// scripts/scheduler.mjs (outline)
import { Cron } from "croner";
const tz = process.env.APP_TIMEZONE;
const call = (path) =>
  fetch(`${process.env.APP_INTERNAL_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
    .then((r) => console.log(path, r.status))
    .catch((e) => console.error(path, e));

new Cron("0 6 * * 0", { timezone: tz }, () => call("/api/cron/create-session"));
new Cron("*/5 * * * *", { timezone: tz }, () => call("/api/cron/open-close"));
new Cron("0 21 * * 0", { timezone: tz }, () => call("/api/cron/process-absences"));
new Cron("0 3 * * *", { timezone: tz }, () => call("/api/cron/purge-locations"));
```

Every job is idempotent. Admins can also create, open, close, and process sessions manually from the dashboard, so a missed run is never fatal.

---

## Build Roadmap

Each phase ends with a **done-when** check. Commit after every phase.

### Phase 0: Scaffold & infrastructure

- [x] Next.js 16 app (TypeScript, Tailwind, App Router, `src/`), shadcn/ui, ESLint, Prettier
- [x] Dockerfile, `docker-compose.yml`, `.env.example`
- [x] `/api/health` reports DB and PostGIS version

**Done when:** `docker compose up` serves the app and `/api/health` returns `{ db: "ok", postgis: "3.6…" }`.

### Phase 1: Database layer

- [x] Drizzle schema with `geography` custom type; migrations, including extensions
- [x] Seed script
- [x] `lib/geo.ts` with unit tests

**Done when:** Fresh migrate + seed works; geofence boundary tests pass.

### Phase 2: Auth & roles

- [x] Better Auth + email-OTP plugin + Drizzle adapter; user model mapped to `users`, UUID IDs
- [x] Login page (email → code); dev console fallback for codes
- [x] `proxy.ts` route protection plus server-side role checks in every admin route
- [x] Long-lived sessions (e.g. 60 days, sliding)

**Done when:** Members can't reach `/admin`; APIs return 401/403 correctly.

### Phase 3: Admin geofence & sessions

- [x] `GeofencePicker` (client-only, Leaflet marker icon fix, draggable marker, radius slider 20–500 m, live circle, "use my location", Nominatim search with debounce and attribution)
- [x] Session list, create, cancel, edit window

**Done when:** The geofence saves and reloads; new sessions copy it.

### Phase 4: Geofence check-in

- [x] `POST /api/checkin/geofence` per the pipeline
- [x] Member home states: requesting location, checking in, ✓ checked in, too far (distance), location denied (instructions), no service now, "Scan QR instead"
- [x] Auto-trigger on load and on `visibilitychange`

**Done when:** Playwright covers all five geolocation scenarios.

### Phase 5: PWA

- [x] Manifest and icons, Serwist service worker, caching rules, offline page
- [x] Install prompts for Android and iOS

**Done when:** Lighthouse marks the app installable; it installs on both platforms.

### Phase 6: QR fallback

- [x] `lib/qr-token.ts` with tests
- [x] Admin display page (full-screen, 30 s rotation, countdown)
- [x] Member scanner page → GPS → `POST /api/checkin/qr`
- [x] Admin manual check-in

**Done when:** A screenshot of the QR stops working within about 60 s; a valid scan from outside the geofence is rejected.

### Phase 7: Absence engine & emails

- [ ] Cron routes + scheduler service
- [ ] `lib/absences.ts` per the spec, with tests for every branch and for idempotency
- [ ] React Email templates, Brevo batch sending, `notifications_log`
- [ ] Signed unsubscribe link and settings page

**Done when:** Running the job twice sends no duplicates; emails render correctly in Brevo.

### Phase 8: Admin dashboard

- [ ] Follow-up list first (sorted by streak; notes, assign, resolve)
- [ ] This-Sunday summary with live count; 12-week trend chart
- [ ] Members page (search, add/edit/deactivate, CSV import/export, history)
- [ ] Session detail (attendees, absentees, excuse button)

**Done when:** An admin can run a full Sunday and the follow-up workflow without touching the database.

### Phase 9: Hardening & production

- [ ] Rate limiting, security headers, location purge job
- [ ] Backups, Caddy HTTPS, Brevo domain verification (SPF, DKIM, DMARC), error logging
- [ ] Full E2E run and on-site dry run

**Done when:** Deployed over HTTPS on your domain, a backup restores successfully, and a real Sunday dry run succeeds.

---

## Open Decisions

Defaults are shown. They were accepted when Phase 2 started (the user said to continue), so admins add members and sign-up is off.

| Decision         | Default                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| How members join | Admins add members (or CSV import); members then log in with OTP. Open sign-up is disabled. |
| Service window   | Sundays, 08:00–11:30 local time; one service per Sunday                                     |
| Flag clearing    | Streak resets automatically on return; follow-up stays open until a leader resolves it      |
| Members under 18 | Guardian consent required; 90-day coordinate retention                                      |
| Hosting          | Single VPS + Docker + Caddy; your own domain for the app and email                          |

---
