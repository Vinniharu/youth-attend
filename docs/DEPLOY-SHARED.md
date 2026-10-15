# Deploying Pulse on a shared server (attend.getzylo.site)

Use this guide when the server already runs other web apps. Pulse sits beside them
without touching them:

- **No new public ports.** The app listens on the server's loopback only
  (`127.0.0.1:3061`). Your existing reverse proxy (nginx or Caddy) forwards
  `attend.getzylo.site` to it. The database isn't published at all.
- **Its own everything:** the Docker project `pulse-attend`, so containers, network and
  volumes are all prefixed `pulse-attend_`; its own folder (`/opt/pulse-attend`); its
  own nginx/Caddy site file; its own database container. Nothing is shared with
  other apps.
- **Capped resources:** about 2.2 GB of memory and 2.75 CPUs at most across all its
  containers (in practice it idles at about 150 MB).
- **Firewall unchanged.** Docker-published ports bypass `ufw`; binding to `127.0.0.1`
  is what keeps the app private, so keep that address in `APP_PORT`'s mapping.

For a server with nothing else on it, use [`DEPLOY.md`](DEPLOY.md) instead.

Commands below assume Ubuntu/Debian and a user with `sudo`. Lines starting with `#`
are comments.

---

## Step 0. Look before changing anything (read-only)

```bash
# What already serves ports 80/443? (tells you which proxy to use in step 6)
sudo ss -ltnp | grep -E ':(80|443)\s'
systemctl is-active nginx caddy apache2 2>/dev/null
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E ':(80|443)->'

# Is port 3061 free on loopback? (no output = free; otherwise pick another APP_PORT)
sudo ss -ltnp | grep ':3061\s'

# Room to build and run: want ~2.5 GB available memory and ~5 GB free disk
free -h
df -h /

# Docker Compose v2.24+ is needed (for the `!override` / `!reset` tags)
docker compose version

# Make sure no other project is already called pulse-attend
docker compose ls
```

What the first three commands tell you:

| You see                                                                      | Use in step 6                                |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `nginx` on 80/443                                                            | **6A** (nginx)                               |
| `caddy` on 80/443                                                            | **6B** (Caddy)                               |
| A Docker container on 80/443 (Traefik, nginx-proxy, Coolify, …) or `apache2` | **6C**                                       |
| Nothing on 80/443                                                            | Use [`DEPLOY.md`](DEPLOY.md) (bundled Caddy) |

**If memory is tight** (under ~2.5 GB available): building the app briefly needs about
2 GB. Build at a quiet time, or add swap first:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Step 1. DNS

At the DNS provider for **getzylo.site**, add:

| Type | Name     | Value                                                        |
| ---- | -------- | ------------------------------------------------------------ |
| A    | `attend` | your server's IPv4                                           |
| AAAA | `attend` | its IPv6 (only if it has one and your proxy listens on IPv6) |

**Using Cloudflare?** Set the record to **DNS only** (grey cloud), at least for now.
Behind Cloudflare's proxy every visitor would appear to come from a Cloudflare IP,
so the per-IP sign-in limits would lump everyone together.

Check from your own computer (may take a few minutes):

```bash
dig +short attend.getzylo.site     # must print the server's IP
```

---

## Step 2. Email (Resend)

Sign-in codes are emailed, so this must work before anyone else can log in.

1. In Resend: **Domains → Add Domain → `getzylo.site`**.
2. Add the DNS records Resend shows. They use their own names, so they **don't touch**
   records that other services (such as a product sending through Brevo) already use:
   - **DKIM:** a TXT record on `resend._domainkey`
   - **SPF / bounces:** an MX and a TXT record on the `send` subdomain
     (`send.getzylo.site`), not on the root, so the root SPF record stays as it is.
   - **DMARC:** if `_dmarc.getzylo.site` already exists, leave it. If not, add TXT
     `_dmarc` = `v=DMARC1; p=none; rua=mailto:you@getzylo.site`.
3. Click **Verify** and wait until the domain shows **Verified** (minutes to a few
   hours).
4. **API Keys → Create API Key:** permission **Sending access**, domain
   `getzylo.site`. Copy it (it's shown once) for step 4.

Any address on the verified domain can send; this guide uses `noreply@getzylo.site`.

---

## Step 3. Get the code

```bash
sudo mkdir -p /opt/pulse-attend
sudo chown "$USER": /opt/pulse-attend
git clone https://github.com/Vinniharu/youth-attend.git /opt/pulse-attend
cd /opt/pulse-attend
```

(If the repository is private, use a GitHub deploy key or a fine-grained read-only token.)

Your user must be able to run Docker (`docker ps` works without `sudo`). If it can't,
prefix every `docker` command below with `sudo`.

---

## Step 4. Configure `.env`

```bash
cd /opt/pulse-attend
cp .env.example .env
chmod 600 .env                       # secrets: readable by you only

# Generate the secrets; paste each value into .env in the next step
echo "DB_PASSWORD=$(openssl rand -hex 24)"
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
echo "UNSUBSCRIBE_SECRET=$(openssl rand -base64 32)"

nano .env
```

Set these (leave everything else at its default):

```bash
# Shared-server mode: these two make plain `docker compose …` use the right files
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml:docker-compose.shared.yml
COMPOSE_PROJECT_NAME=pulse-attend

DOMAIN=attend.getzylo.site
APP_PORT=3061                        # loopback port your proxy forwards to
BETTER_AUTH_URL=https://attend.getzylo.site
APP_URL=https://attend.getzylo.site
BETTER_AUTH_TRUSTED_ORIGINS=         # empty in production

DB_PASSWORD=<from above>
DATABASE_URL=postgres://church:<same DB_PASSWORD>@localhost:5432/attendance
BETTER_AUTH_SECRET=<from above>
CRON_SECRET=<from above>
UNSUBSCRIBE_SECRET=<from above>

RESEND_API_KEY=<from step 2>
EMAIL_FROM="Pulse <noreply@getzylo.site>"
ADMIN_ALERT_EMAILS=pastor@example.org,youthlead@example.org   # leaders who get follow-up alerts

APP_TIMEZONE=Africa/Lagos
DEFAULT_SERVICE_START=08:00
DEFAULT_SERVICE_END=11:30
```

Never commit `.env`, and don't change `DB_PASSWORD` after the first start (the database
keeps the password it was created with).

---

## Step 5. Build and start

```bash
cd /opt/pulse-attend
docker compose up -d --build         # first build takes a few minutes
docker compose ps                    # db healthy, migrate exited 0, app healthy, scheduler + backup up
```

Check it's running and private:

```bash
curl -s http://127.0.0.1:3061/api/health
# {"db":"ok","postgis":"3.6.x"}

sudo ss -ltnp | grep ':3061\s'
# must show 127.0.0.1:3061, never 0.0.0.0:3061
```

At this point the app isn't public yet; nothing about your other sites has changed.

---

## Step 6. Connect your reverse proxy

### 6A. nginx

```bash
cd /opt/pulse-attend
sudo cp deploy/nginx/attend.getzylo.site.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/attend.getzylo.site.conf /etc/nginx/sites-enabled/
sudo nginx -t                        # must say "syntax is ok" before you reload
sudo systemctl reload nginx          # reload, not restart: other sites stay up

# HTTPS certificate for this one name (adds the 443 block and http→https redirect
# to this file only)
sudo apt install -y certbot python3-certbot-nginx   # if certbot isn't installed yet
sudo certbot --nginx -d attend.getzylo.site
```

If your nginx keeps sites in `/etc/nginx/conf.d/` instead (no `sites-enabled`), copy the
file there with a `.conf` name and skip the `ln` line. If you changed `APP_PORT`, edit
the `proxy_pass` line to match.

Keep these lines from the file: `proxy_set_header X-Forwarded-For $remote_addr` (one
real IP; the sign-in rate limits depend on it) and `proxy_buffering off` (pages
stream). Both apply to this site only.

### 6B. Caddy

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
cat /opt/pulse-attend/deploy/caddy/attend.getzylo.site.caddy | sudo tee -a /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy          # Caddy gets the certificate by itself
```

### 6C. Caddy running in Docker (e.g. another project's `…-caddy-1` container)

A proxy inside a container can't reach the host's `127.0.0.1:3061`, so Pulse adds a
small relay, `pulse-attend-web` (`docker-compose.proxy-network.yml`). It is the only
Pulse container that joins the proxy's Docker network. The Pulse app and database stay
on Pulse's own network, so names like `app` or `db` never clash with the other
project's services. The other project's containers and compose files are not changed;
its Caddyfile gets one extra site block.

1. **Find the proxy's network and Caddyfile** (read-only; replace `zylo-caddy-1` with
   your container's name):

   ```bash
   docker inspect zylo-caddy-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
   docker inspect zylo-caddy-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
   ```

   The first prints the network (e.g. `zylo_default`). In the second, find the line
   ending `-> /etc/caddy/Caddyfile` (or `-> /etc/caddy`); the left side is the
   Caddyfile on the server.

2. **Add the relay to Pulse.** In `/opt/pulse-attend/.env`, replace the `COMPOSE_FILE`
   line and add `PROXY_NETWORK`:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml:docker-compose.shared.yml:docker-compose.proxy-network.yml
   PROXY_NETWORK=zylo_default
   ```

   Then `docker compose up -d` and check `docker compose ps` shows `pulse-attend-web`
   running.

3. **Add the site to the proxy's Caddyfile** (path from step 1), keeping a backup.
   `tee -a` appends in place, which a bind-mounted single file needs:

   ```bash
   sudo cp /path/to/Caddyfile /path/to/Caddyfile.bak
   cat /opt/pulse-attend/deploy/caddy/attend.getzylo.site.docker.caddy | sudo tee -a /path/to/Caddyfile
   docker exec zylo-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec zylo-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

   `reload` is graceful: the other sites keep running, and if the config were invalid
   Caddy would keep the old one. If `reload` says the admin API is unavailable, use
   `docker restart zylo-caddy-1` instead (a second or two of downtime for its sites).

To undo: restore the `.bak` Caddyfile and reload, then remove
`:docker-compose.proxy-network.yml` from `COMPOSE_FILE` and `docker compose up -d
--remove-orphans`.

For Traefik, nginx-proxy, Apache or a hosting panel, the relay works the same way: the
proxy must forward `attend.getzylo.site` to `pulse-attend-web:8080`, pass the real
client IP as a **single** `X-Forwarded-For` value, and not buffer responses.

---

## Step 7. Check it from outside

```bash
curl -s https://attend.getzylo.site/api/health
curl -sI https://attend.getzylo.site/login | grep -iE 'HTTP/|strict-transport|content-security'
```

Then open `https://attend.getzylo.site` in a browser: you should see the Pulse sign-in
page with a valid padlock. Check your other sites still load (they should; only a new
site file was added).

---

## Step 8. First leader and setup

```bash
cd /opt/pulse-attend
docker compose run --rm migrate node scripts/create-admin.mjs "Your Name" you@example.com
```

Sign in at `https://attend.getzylo.site/login` with the emailed code, then in **Admin**:

1. **Geofence:** search for the church, drag the pin onto the building, radius 100–150 m,
   save.
2. **Members:** import a CSV (`name,email,phone`) or add people. Make other leaders
   **Leader (admin)**.
3. **Sessions:** automatic (created Sunday 06:00, opened and closed by the window,
   absences processed at 21:00). You can also do each step by hand.

**Never run `npm run db:seed` or `db:reset` on the server.**

---

## Step 9. Backups

A dump is written to `/opt/pulse-attend/backups/` every night at 02:00, kept 30 days.

```bash
docker compose exec backup sh /scripts/backup.sh now     # take one now
ls -lh /opt/pulse-attend/backups
```

Copy them **off the server** too. For example, from another machine, daily:

```bash
rsync -az youruser@your-server:/opt/pulse-attend/backups/ ~/pulse-backups/
```

Restore steps (into a scratch database to test, or over the live one) are in
[`DEPLOY.md` §7](DEPLOY.md#7-backups); with `COMPOSE_FILE` in `.env`, use
`docker compose` wherever that guide says `dc`.

---

## Step 10. Day-to-day

| Task            | Command (from `/opt/pulse-attend`)                                             |
| --------------- | ------------------------------------------------------------------------------ |
| Status          | `docker compose ps`                                                            |
| App logs        | `docker compose logs -f app` (scheduler: `logs -f scheduler`)                  |
| Update          | `git pull && docker compose up -d --build` (migrations run first)              |
| Free old images | `docker image prune -f --filter label=com.docker.compose.project=pulse-attend` |
| Stop            | `docker compose stop` (start again with `docker compose start`)                |
| Resource use    | `docker stats --no-stream \| grep pulse-attend`                                |

Commands that **affect other apps or delete data**; don't use them here:

- `docker system prune`, `docker volume prune`, `docker image prune -a` without the
  filter above (they act on the whole server's Docker).
- `docker compose down -v` (deletes Pulse's database volume).
- `sudo systemctl restart nginx` (use `reload`; a bad config would take every site down
  on restart, whereas `nginx -t` + `reload` keeps the old config running).

## Switching an existing install from Brevo to Resend

Installs set up before the switch used `BREVO_API_KEY`. To move over:

1. Do Step 2 (Resend domain + API key). Leave any Brevo DNS records in place if
   another product still sends through Brevo.
2. `cd /opt/pulse-attend && git pull`
3. `nano .env`: delete the `BREVO_API_KEY=` line, add `RESEND_API_KEY=re_…`, and make
   sure `EMAIL_FROM` uses the domain verified in Resend.
4. `docker compose up -d --build`, then `docker compose up -d --force-recreate app`
   (makes sure the app reads the new `.env`).
5. Request a sign-in code at `/login`; it should arrive and show in Resend's **Emails**
   log. If not: `docker compose logs app | grep -iE 'email|resend'`.

## Removing Pulse later

```bash
cd /opt/pulse-attend
docker compose down                  # keeps the data volume; add -v only to wipe it
sudo rm /etc/nginx/sites-enabled/attend.getzylo.site.conf && sudo nginx -t && sudo systemctl reload nginx
sudo certbot delete --cert-name attend.getzylo.site
```

---

## Before the first real Sunday

Do the on-site dry run in [`DEPLOY.md` §10](DEPLOY.md#10-on-site-dry-run-before-the-first-real-sunday):
install on an iPhone and an Android, check in inside and outside the building, test the
projected QR code (and that a shared photo fails away from church), process absences, and restore
a backup.
