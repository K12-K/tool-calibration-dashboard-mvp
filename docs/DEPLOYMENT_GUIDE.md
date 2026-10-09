# Calibration Log – Deployment Guide (client on-premise server)

Audience: the IT person / engineer installing the application on the client's server.
Allow about 1–2 hours for a first installation, including HTTPS and backups.

---------------------------------------------------------------------

## 1. Architecture

```
 Browser ──HTTP(S)──▶  nginx  (container "web", port 80 → published as HTTP_PORT)
                         │  serves the React app (static files)
                         └─ /api/*  ──▶  FastAPI  (container "backend", port 8000, internal only)
                                           ├──▶ PostgreSQL 16  (container "db", internal only)
                                           └──▶ uploaded files (Docker volume "uploads" → /data/uploads)
```

Only the `web` container is reachable from the network. The database and API are not published.
All state lives in two Docker volumes: **pgdata** (database) and **uploads** (certificates and images).

## 2. Requirements

| Item        | Minimum                                                                 |
|-------------|-------------------------------------------------------------------------|
| Server      | 2 CPU, 4 GB RAM, 20 GB disk (+ space for uploads: ~8 files × 3 MB per gauge worst case) |
| OS          | Linux (Ubuntu 22.04/24.04, Debian 12, RHEL 9 …) with Docker Engine 24+ and the Compose plugin v2 – **recommended**. Windows Server: see section 9 |
| Network     | One free TCP port for the web app (default 8080, or 80/443 with HTTPS). Outbound internet is only needed to build the images (see section 7 for offline sites) |
| Users' devices | Any modern browser (Chrome, Edge, Firefox, Safari); a phone/tablet with an authenticator app for 2FA |

## 3. Information to collect from the client first

- Server name / IP address and which port or URL users will open (e.g. `https://calibration.company.local`).
- Whether HTTPS is required (it should be) and where the certificate comes from (company CA, IT-provided PFX/PEM).
- The plant **time zone** (IANA name, e.g. `America/Chicago`). It decides what "today" and "days left" mean.
- Company logo (PNG/SVG, transparent background, about 200×60 px), company name, footer text.
- Whether sign-up should be limited to company email domains (e.g. `acme.com`).
- Where backups should be stored (network share, backup server) and who owns restores.
- Who will be the first user (becomes **administrator**).

## 4. Installation with Docker (recommended)

```bash
# 4.1 Install Docker (Ubuntu example)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # log out / in afterwards

# 4.2 Copy the project to the server, e.g. /opt/calibration-dashboard
cd /opt/calibration-dashboard

# 4.3 Configure
cp .env.example .env
nano .env
```

Edit `.env` (all values are documented inside the file):

| Variable | What to set |
|---|---|
| `ENVIRONMENT` | `production` |
| `HTTP_PORT` | Port to publish, e.g. `80` (or `8080` when a reverse proxy/HTTPS terminator sits in front) |
| `POSTGRES_PASSWORD` | A strong password, **letters and digits only** (or URL-encode special characters) |
| `SECRET_KEY` | Output of `openssl rand -hex 32`. The app refuses to start in production with a weak key |
| `TZ` | Plant time zone, e.g. `America/Chicago` |
| `REGISTRATION_ALLOWED_EMAIL_DOMAINS` | e.g. `acme.com` (empty = anyone who can reach the site may register) |
| `ALLOW_REGISTRATION` | Keep `true` while onboarding users; set `false` afterwards if desired |
| `TOTP_ISSUER` | Name that appears in the authenticator app |

Branding – edit `frontend/public/config.js`:

```js
window.__APP_CONFIG__ = {
  companyName: "Acme Manufacturing",
  logoUrl: "/acme-logo.png",          // put the file next to config.js in frontend/public/
  footerText: "© Acme Manufacturing — Calibration Log. Internal use only.",
  apiBaseUrl: "/api",
};
```

If you add a logo file, place it in `frontend/public/` **before** building (it is copied into the image).
Later, changes to `config.js` alone only need `docker compose restart web`.

```bash
# 4.4 Build and start
docker compose up -d --build

# 4.5 Check
docker compose ps                      # all three services "running"/"healthy"
curl -s http://localhost:${HTTP_PORT:-8080}/api/health      # {"status":"ok"}
docker compose logs -f backend         # "Calibration Log API ready"
```

Open `http://<server>:<HTTP_PORT>`, click **Create an account**, register the first user
(this user becomes the **administrator**), scan the QR code, enter the 6-digit code, then sign in.

## 5. HTTPS

Authentication data and tokens must not travel over plain HTTP. Choose one:

**A. The client already has a reverse proxy / load balancer / IIS ARR** – publish the app on an internal port
(`HTTP_PORT=8080`) and have the proxy forward `https://calibration.company.local` → `http://<server>:8080`,
passing `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`. Set the proxy's upload limit to at least 5 MB.

**B. Terminate TLS in the bundled nginx** – copy the certificate and key to `./certs/fullchain.pem` and
`./certs/privkey.pem`, then:

1. In `frontend/nginx.conf` replace `listen 80;` with:
   ```nginx
   listen 443 ssl;
   ssl_certificate     /etc/nginx/certs/fullchain.pem;
   ssl_certificate_key /etc/nginx/certs/privkey.pem;
   ssl_protocols TLSv1.2 TLSv1.3;
   ```
   and add a second server block that redirects port 80 to 443 if wanted:
   ```nginx
   server { listen 80; return 301 https://$host$request_uri; }
   ```
2. In `docker-compose.yml`, under `web:` set `ports: ["80:80", "443:443"]` and add the volume
   `- ./certs:/etc/nginx/certs:ro`.
3. `docker compose up -d --build web`

## 6. Day-2 operations

### Users and lock-outs
Admin commands run inside the backend container:

```bash
docker compose exec backend python -m app.cli list-users
docker compose exec backend python -m app.cli reset-2fa   user@company.com   # user lost their phone
docker compose exec backend python -m app.cli make-admin  user@company.com
docker compose exec backend python -m app.cli disable-user user@company.com
```

`reset-2fa` prints a new secret/QR in the terminal; hand it to the user securely, they add it to the authenticator app.

- Password reset is **self-service via the authenticator app** (*Forgot password?* on the login page).
- 5 wrong passwords/codes lock the account for 15 minutes. Resetting a password signs out all of that user's sessions.
- Sessions last 8 hours (`ACCESS_TOKEN_EXPIRE_MINUTES`).

### Backups (do this before go-live)
```bash
./scripts/backup.sh /mnt/backup-share/calibration      # database dump + uploaded files
./scripts/restore.sh /mnt/backup-share/calibration/20260101-020000
```
Schedule nightly with cron, e.g. `0 2 * * * cd /opt/calibration-dashboard && ./scripts/backup.sh /mnt/backup-share/calibration`.
Keep several generations and **test a restore on a spare machine** at least once. Backups contain personal data and
authenticator secrets – protect the destination.

### Upgrades
```bash
./scripts/backup.sh
# copy the new project files over the old ones (keep .env and frontend/public/config.js)
docker compose up -d --build
```
Tables are created automatically but not migrated. If a future version changes the schema, it will ship with a migration note.

### Logs and health
`docker compose logs --tail=200 backend` · `docker compose logs --tail=200 web` · `GET /api/health`.

## 7. Servers without internet access

Build the images on any internet-connected machine, then move them:

```bash
docker compose build
docker pull postgres:16-alpine
docker save -o calibration-images.tar calibration-dashboard-backend calibration-dashboard-web postgres:16-alpine
# copy calibration-images.tar + project folder (without node_modules) to the client server, then:
docker load -i calibration-images.tar
docker compose up -d            # no --build: the images are already loaded
```
(If `docker images` shows different image names, use those names in the `docker save` command.)

## 8. Installation without Docker (Linux)

1. **PostgreSQL 14+**: `sudo -u postgres createuser calibration -P` · `sudo -u postgres createdb calibration -O calibration`.
2. **Backend** (Python 3.12):
   ```bash
   cd /opt/calibration-dashboard/backend
   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   cp .env.example .env     # set ENVIRONMENT=production, DATABASE_URL, SECRET_KEY, UPLOAD_DIR=/var/lib/calibration/uploads, CORS_ORIGINS empty
   ```
   systemd unit `/etc/systemd/system/calibration.service`:
   ```ini
   [Unit]
   Description=Calibration Log API
   After=network.target postgresql.service
   [Service]
   User=calibration
   WorkingDirectory=/opt/calibration-dashboard/backend
   EnvironmentFile=/opt/calibration-dashboard/backend/.env
   ExecStart=/opt/calibration-dashboard/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 --proxy-headers
   Restart=always
   [Install]
   WantedBy=multi-user.target
   ```
3. **Frontend**: `cd frontend && npm install && npm run build` → copy `dist/*` to `/var/www/calibration`.
4. **nginx**: use `frontend/nginx.conf`, change `proxy_pass http://backend:8000;` to `http://127.0.0.1:8000;` and `root` to `/var/www/calibration`.
5. Back up with `pg_dump -Fc calibration` and a copy of the `UPLOAD_DIR` folder.

## 9. Windows Server

Preferred: install **Docker Desktop / Docker Engine with WSL2** (check licensing with the client) or run a small Linux VM
(Hyper-V) and follow section 4. Native install is possible (PostgreSQL for Windows, Python, `uvicorn` run as a service with NSSM,
IIS or nginx for Windows serving `dist/` and proxying `/api`), following the same steps as section 8. Schedule backups with Task Scheduler.

## 10. Security checklist

- [ ] `ENVIRONMENT=production`, strong `SECRET_KEY` and `POSTGRES_PASSWORD`; `.env` readable only by the admin (`chmod 600 .env`).
- [ ] HTTPS in front of the app; port 5432 and 8000 **not** reachable from the network (default in this compose file).
- [ ] `REGISTRATION_ALLOWED_EMAIL_DOMAINS` set, or `ALLOW_REGISTRATION=false` after onboarding. There is no email verification (no mail server on-prem), so restricting sign-up matters.
- [ ] Server clock synchronised (NTP) – TOTP codes depend on it (±30 s tolerated).
- [ ] Nightly backups verified, with a documented restore owner.
- [ ] OS and Docker updates scheduled; images rebuilt occasionally (`docker compose build --pull`).
- [ ] Authenticator secrets are stored in the database; restrict database and backup access accordingly.
- [ ] Rotating `SECRET_KEY` signs everybody out (they simply log in again) – 2FA is not affected.

## 11. Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` enforces a strong secret and hides `/api/docs` |
| `DATABASE_URL` | local Postgres | `postgresql+psycopg://user:pass@host:5432/db` (set automatically by compose) |
| `SECRET_KEY` | – | Signs login tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 480 | Session length |
| `UPLOAD_DIR` | `./uploads` (`/data/uploads` in Docker) | Where certificates/images are stored |
| `MAX_UPLOAD_BYTES` | 3145728 | Max size per file (3 MB). If raised, also raise `client_max_body_size` in `frontend/nginx.conf` |
| `MAX_IMAGES` / `MAX_CERTIFICATES` | 5 / 3 | Per-gauge limits |
| `ALLOW_REGISTRATION` | `true` | Open sign-up on/off |
| `REGISTRATION_ALLOWED_EMAIL_DOMAINS` | empty | Comma-separated allow-list |
| `TOTP_ISSUER` | `Calibration Log` | Label shown in the authenticator app |
| `MAX_FAILED_ATTEMPTS` / `LOCKOUT_MINUTES` | 5 / 15 | Brute-force protection |
| `DUE_SOON_DAYS` | 10 | Default window of the "due soon" report |
| `CORS_ORIGINS` | empty | Only needed when the UI is hosted on a different origin than the API |
| `TZ` (compose only) | `UTC` | Time zone for "today" |

Dropdown values (status, location) are defined in `backend/app/constants.py`; rebuild the backend after changing them.

## 12. Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up` stops with "Set SECRET_KEY / POSTGRES_PASSWORD" | Fill the values in `.env` |
| Backend exits: "SECRET_KEY must be set…" | `ENVIRONMENT=production` needs a random key of 32+ chars not starting with "change" |
| Backend log "Database not ready" for a long time | Wrong `POSTGRES_PASSWORD` after the volume was first created. Either use the original password or remove the volume (**deletes data**): `docker compose down -v` |
| Login works but 2FA code is "invalid" | Phone/server clock out of sync; each code can be used once; wait for the next code |
| Upload fails with "File is too large" | File > 3 MB, or reverse proxy limit < 5 MB |
| Page loads but API calls fail (502) | `docker compose logs backend`; make sure `backend` is running |
| Logo missing | File path in `config.js` must exist inside `frontend/public/`; rebuild `web` |
| "Days left" off by one near midnight | `TZ` not set to the plant's time zone |
