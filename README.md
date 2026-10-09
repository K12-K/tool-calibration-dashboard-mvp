# Calibration Log Dashboard

Web application to track gauge / instrument calibrations (built from `Calibration.xlsx`).

| Layer    | Technology                                            |
|----------|-------------------------------------------------------|
| Frontend | React 18 + TypeScript (Vite), React Router, TanStack Query |
| Backend  | Python 3.12, FastAPI, SQLAlchemy 2                    |
| Database | PostgreSQL 16                                         |
| Auth     | Email + password, TOTP 2FA (authenticator app), password reset via authenticator |
| Packaging| Docker Compose (nginx serves the UI and proxies `/api`) |

## Pages (mirrors the Excel sheets)

1. **Database table (home)** – all entries, *Add New Entry* button, Excel-style column menus (sort newest/oldest or A–Z, searchable value checklist), global search, pagination, **View** / **Edit** on every row (clicking a row opens it for editing).
2. **Form** – ASSET #, DESCRIPTION, MANUFACTURER, S/N, GAUGE CODE, LOCATION, STATUS, DATE OF CALIBRATION, FREQUENCY, DUE DATE and DAYS LEFT (auto), COMMENTS, up to 3 calibration-certificate PDFs, up to 5 images. PDFs/images open in a pop-up and can be downloaded.
3. **Reports** (the "DASHBOARD" sheet) – calibrations due in the next N days (default 10), past-due calibrations, status breakdown, CSV export and print.

## Quick start – everything in Docker (recommended)

```bash
cp .env.example .env          # edit passwords / SECRET_KEY (see comments inside)
docker compose up -d --build
# open http://localhost:8080
```

The **first account you register becomes the administrator**. Registration shows a QR code – scan it with
Google Authenticator / Microsoft Authenticator / Authy, then enter the 6-digit code to activate the account.

## Quick start – development without Docker

Prerequisites: Python 3.12+, Node 20+, a PostgreSQL 14+ server.

```bash
# 1) database (example using Docker just for Postgres)
docker run -d --name calibration-db -p 5432:5432 \
  -e POSTGRES_USER=calibration -e POSTGRES_PASSWORD=calibration -e POSTGRES_DB=calibration postgres:16-alpine

# 2) backend
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000                # API docs: http://localhost:8000/api/docs

# 3) frontend (new terminal)
cd frontend
npm install
npm run dev                                              # http://localhost:5173
```

Tables are created automatically on first start. Run `python tests/test_calc.py` (inside `backend`) for the due-date logic test and `npm run typecheck` (inside `frontend`) for a TypeScript check.

## Deploying at a client site

See **[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)**. Everything site-specific lives in two places:
`.env` (passwords, port, time zone, sign-up rules) and `frontend/public/config.js` (logo, company name, footer text).

## Project layout

```
backend/app/      FastAPI app (routers/, models.py, schemas.py, security.py, cli.py …)
frontend/src/     React app (pages/, components/, api/, auth/)
docs/             Deployment guide
scripts/          backup.sh / restore.sh
docker-compose.yml, .env.example
```

## Business rules worth knowing

* **Due date** = date of calibration + frequency (months). **Days left** = due date − today (recalculated on every request, never stale).
* A gauge whose status is **CALIBRATED** but whose due date has passed is *displayed* as **PAST DUE** (the saved status is not changed).
* Gauges that are **OUT OF SERVICE**, **REFERENCE ONLY** or **MISSING/LOST** are left out of the due-soon / past-due reports.
* Asset # is unique (case-insensitive). Asset # and S/N accept letters, digits, space and `. _ / -`.
* Status and location dropdown values live in `backend/app/constants.py`.
* Only administrators can delete an entry.
