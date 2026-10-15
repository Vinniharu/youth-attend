# Deploying Pulse

One small server runs everything with Docker: PostgreSQL + PostGIS, the app, the
scheduler, nightly backups, and Caddy for HTTPS. Plan about 30 minutes for the first
deploy, plus DNS and email verification time.

## 1. What you need

- A Linux VPS with **2 GB RAM** or more (Ubuntu 24.04 is fine) and Docker Engine with
  the Compose plugin (`docker compose version` works).
- A domain or subdomain for the app, e.g. `attendance.yourchurch.org`.
- A Brevo account (free tier is enough to start) and access to your domain's DNS.

## 2. Point the domain at the server

Create an **A record** (and AAAA if the server has IPv6) for the app's hostname
pointing at the server's IP. Open ports **80** and **443** in the server firewall.
Caddy requests the HTTPS certificate automatically on first start, so DNS must
already resolve to the server.

## 3. Set up email in Brevo

1. **Senders, domains & dedicated IPs → Domains → Add a domain** for the address
   you'll send from (e.g. `yourchurch.org`).
2. Add the DNS records Brevo shows you:
   - **DKIM** (TXT `brevo._domainkey`, or the CNAMEs Brevo lists)
   - **Brevo code** (TXT for ownership)
   - **SPF**: include Brevo in your SPF TXT record, e.g.
     `v=spf1 include:spf.brevo.com ~all` (merge with any existing SPF record; a
     domain must have only one).
   - **DMARC** if you don't have one: TXT `_dmarc` with
     `v=DMARC1; p=none; rua=mailto:you@yourchurch.org` (tighten to `quarantine` later).
3. Wait until Brevo shows the domain as **authenticated**, then add a sender such as
   `noreply@yourchurch.org`.
4. **SMTP & API → API keys → Generate a new API key.** Keep it for `.env`.

## 4. Configure the server

```bash
git clone https://github.com/Vinniharu/youth-attend.git pulse
cd pulse
cp .env.example .env
```

Edit `.env`:

| Variable                                                  | Production value                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DB_PASSWORD`                                             | `openssl rand -hex 24` (URL-safe)                                                                                        |
| `DATABASE_URL`                                            | `postgres://church:<DB_PASSWORD>@localhost:5432/attendance` (only used by host-side scripts; containers build their own) |
| `BETTER_AUTH_SECRET`, `CRON_SECRET`, `UNSUBSCRIBE_SECRET` | each `openssl rand -base64 32`                                                                                           |
| `DOMAIN`                                                  | `attendance.yourchurch.org`                                                                                              |
| `BREVO_API_KEY`                                           | the key from step 3                                                                                                      |
| `EMAIL_FROM`                                              | `"Youth Church <noreply@yourchurch.org>"` (the verified sender)                                                          |
| `ADMIN_ALERT_EMAILS`                                      | leaders who get "needs a follow-up" emails, comma-separated                                                              |
| `APP_TIMEZONE`                                            | e.g. `Africa/Lagos`                                                                                                      |
| `DEFAULT_SERVICE_START` / `END`                           | your Sunday check-in window, e.g. `08:00` / `11:30`                                                                      |

`BETTER_AUTH_URL` and `APP_URL` are set from `DOMAIN` by `docker-compose.prod.yml`.
Leave `BETTER_AUTH_TRUSTED_ORIGINS` empty in production.

## 5. Start it

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -s https://attendance.yourchurch.org/api/health   # {"db":"ok","postgis":"3.6.x"}
```

Tip: `alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'`.

**Never run `npm run db:seed` or `db:reset` in production** (they replace all data
with demo data, and refuse non-local databases anyway).

## 6. Create the first leader

```bash
dc run --rm migrate node scripts/create-admin.mjs "Ada Okoro" ada@yourchurch.org
```

Sign in at `https://attendance.yourchurch.org/login` with a code sent to that
email. Then, in Admin:

1. **Geofence**: find the church, drag the pin onto the building, set the radius
   (100–150 m suits most churches), save.
2. **Members**: import a CSV (`name,email,phone`) or add people one by one. Add other
   leaders as members with the **Leader (admin)** role.
3. **Sessions**: nothing to do. The scheduler creates each Sunday's session at
   06:00, opens and closes check-in by the window, and runs the absence engine at
   21:00. You can also create, open, close and process sessions by hand.

## 7. Backups

The `backup` service writes `./backups/attendance-YYYYMMDD-HHMMSS.dump` every night
at `BACKUP_HOUR` (default 02:00) and deletes dumps older than `BACKUP_KEEP_DAYS`
(default 30). Copy `./backups` off the server regularly (another machine or cloud
storage); a backup on the same disk doesn't survive losing the server.

Take one now: `dc exec backup sh /scripts/backup.sh now`

**Restore** (test this once before you rely on it):

```bash
# Into a scratch database, to check a backup:
dc exec db psql -U church -d postgres -c 'CREATE DATABASE restore_check'
dc exec backup sh /scripts/backup.sh restore /backups/attendance-<stamp>.dump restore_check
dc exec db psql -U church -d restore_check -c 'select count(*) from users'
dc exec db psql -U church -d postgres -c 'DROP DATABASE restore_check'

# Over the live database (stop the app first):
dc stop app scheduler
dc exec backup sh /scripts/backup.sh restore /backups/attendance-<stamp>.dump
dc start app scheduler
```

## 8. Updating

```bash
git pull
dc up -d --build          # migrations run automatically before the app starts
```

## 9. Logs and monitoring

- `dc logs -f app` shows server errors as one JSON line each (method, path, message;
  never cookies or request bodies). `dc logs caddy` shows HTTPS and access logs.
- Logs rotate automatically (10 MB × 5 files per service).
- `GET /api/health` is a good target for an uptime monitor (e.g. UptimeRobot).
- Email delivery: Brevo's dashboard, and `notifications_log` in the database
  (`status`, `error`, `provider_message_id`).

## 10. On-site dry run (before the first real Sunday)

Do this at church on a weekday, with two or three people on different phones
(at least one iPhone and one Android):

1. Admin: create a session for **today** with a window covering now, and open it.
2. Each phone: open the site, **Add to Home Screen** (Android: Install; iPhone:
   Share → Add to Home Screen), open the installed app, sign in with a code.
3. Stand inside the building. Check in automatically. Note how accurate GPS is
   indoors (the "too far"/"too rough" messages say). Widen the radius if needed.
4. Walk outside the radius and confirm "You're not at church yet".
5. Show the code on the projector (**Show check-in code**), scan it with a phone
   camera, and confirm check-in works. Take a photo of the code, wait a minute,
   scan the photo: it must say the code has expired.
6. Admin: mark someone present by hand, excuse someone, close the session, then
   **Process absences now**. Confirm the "we missed you" email arrives (check spam;
   if it lands there, finish Brevo authentication) and that a member with 3 misses
   produces a follow-up and a leader email.
7. Take a backup and restore it into a scratch database (section 7).
