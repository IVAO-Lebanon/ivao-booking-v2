# Deployment guide (Plesk) & multi-division use

This app is **owned and maintained by IVAO Lebanon (LB)**. Other IVAO divisions
may be granted **limited access to run their own instance** scoped to their own
division code — they do **not** own or fork the canonical codebase. See
[Ownership & access model](#ownership--access-model) below.

---

## Architecture (what gets deployed)

The project is a **monorepo** with two separate deployables:

| Part       | What it is                              | On Plesk                                        |
| ---------- | --------------------------------------- | ----------------------------------------------- |
| `server/`  | Node.js + Express API (MySQL)           | A **Node.js application** (Passenger)            |
| `client/`  | React + Vite single-page app (static)   | **Static files** served from `client/dist`      |

The API and the web app talk over HTTP. A typical layout mirrors the legacy
system:

- `booking.<div>.ivao.aero` → serves the built client (`client/dist`)
- `api.booking.<div>.ivao.aero` → the Node API

> You can also host both under one domain (client at the docroot, API on a
> `/api` path via a Plesk reverse-proxy / Apache directive). The two-domain
> split below is the simplest to reason about on Plesk.

---

## Ownership & access model

- **Canonical repository:** `IVAO-Lebanon/ivao-booking-v2` on GitHub. IVAO
  Lebanon retains ownership and controls the `main` branch.
- **Division scoping is configuration, not a code fork.** Each division runs the
  *same* code and points it at their division by setting:
  - `IVAO_DIVISION=BR` (their two-letter IVAO division code)
  - `AUTHORIZED_STAFF_POSITIONS=...` (which staff positions may administer it)
  - their own IVAO OAuth client (`IVAO_CLIENT_ID` / `IVAO_CLIENT_SECRET`)
  - their own database and secrets
- **Limited access:** divisions receive read/deploy access only. Changes to the
  shared codebase go through IVAO Lebanon via pull request; divisions never push
  to `main`. This keeps one maintained core with per-division instances.

---

## Prerequisites on the Plesk server

- **Node.js** extension enabled (Plesk › Extensions › Node.js), Node **18+**.
- **MySQL 8 / MariaDB 10.4+** database + user (Plesk › Databases).
- **Git** deployment enabled for the subscription (Plesk › Git), pointed at this
  repo (or the division's deploy branch).

---

## 1. Database

1. In Plesk › **Databases**, create a database (e.g. `ivao_booking`) and a user.
2. Note the host/port/user/password — they go in the API `.env`.
3. Schema + seed are run from the API app (step 2, "Run once").

---

## 2. Deploy the API (`server/`)

1. **Pull the code** via Plesk Git into the subscription (e.g. under
   `api.booking.<div>.ivao.aero`).
2. Plesk › **Node.js**:
   - **Application Root:** `server`
   - **Application Startup File:** `src/index.js`
   - **Application Mode:** `production`
3. Create `server/.env` (copy from `server/.env.example`) and set at minimum:
   ```env
   NODE_ENV=production
   DEV_AUTH=false                       # MUST be false in production
   PORT=4000                            # Passenger overrides this; keep as fallback
   CLIENT_ORIGINS=https://booking.<div>.ivao.aero
   DB_HOST=... DB_PORT=3306 DB_USER=... DB_PASSWORD=... DB_NAME=ivao_booking
   JWT_SECRET=<a long random string, 32+ chars>
   IVAO_DIVISION=<DIV>                  # e.g. LB, BR
   AUTHORIZED_STAFF_POSITIONS=DIR,ADIR,AOC,AOAC,EC,AEC,WM,AWM,TC,ATC,FTC,AFTC,XA0
   IVAO_CLIENT_ID=...  IVAO_CLIENT_SECRET=...  IVAO_API_KEY=...
   ```
4. **Install dependencies:** in the Node.js panel click **NPM Install**
   (or run `npm ci` in `server/`).
5. **Run once** (Plesk Node.js "Run script", or SSH in `server/`):
   ```bash
   npm run db:reset        # fresh schema + seed  — first deploy only
   # later upgrades: use `npm run migrate` instead of db:reset to preserve data
   ```
6. **Restart App** in the Node.js panel. The API is now live.

---

## 3. Deploy the client (`client/`)

The client is a static build; Plesk serves the compiled files.

1. Create `client/.env` (copy from `client/.env.example`) and set:
   ```env
   VITE_API_BASE=https://api.booking.<div>.ivao.aero/api
   VITE_IVAO_CLIENT_ID=<same public client id as the API>
   VITE_IVAO_REDIRECT_URI=https://booking.<div>.ivao.aero/login/callback
   ```
2. **Build** (SSH in `client/`, or a Plesk Node.js scheduled/one-off task):
   ```bash
   npm ci
   npm run build            # outputs client/dist
   ```
3. Point the domain's **document root** at `client/dist`
   (Plesk › Hosting Settings › Document root), **or** copy `client/dist/*` into
   the docroot.
4. **SPA fallback:** add an `.htaccess` in the docroot so client-side routes
   (e.g. `/login/callback`) don't 404:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

---

## 4. IVAO OAuth (per division)

Each division registers its **own** IVAO OAuth application and sets the redirect
URI to `https://booking.<div>.ivao.aero/login/callback`. Put the client id/secret
in the API `.env` and the **public** client id in the client `.env`. With
`DEV_AUTH=false`, login goes through IVAO SSO.

---

## 5. Updating an instance

1. Plesk › **Git** → **Pull** the latest `main` (or the division's deploy branch).
2. API: **NPM Install** → `npm run migrate` (never `db:reset` on live data) →
   **Restart App**.
3. Client: `npm ci && npm run build`, then redeploy `client/dist`.

---

## Per-division checklist

- [ ] Database created; API `.env` filled (division code, DB, JWT secret, OAuth)
- [ ] `DEV_AUTH=false`, `NODE_ENV=production`
- [ ] `CLIENT_ORIGINS` matches the client domain (CORS)
- [ ] IVAO OAuth app registered with correct redirect URI
- [ ] `IVAO_DIVISION` + `AUTHORIZED_STAFF_POSITIONS` set for that division
- [ ] Client built with correct `VITE_API_BASE` and redirect URI
- [ ] SPA fallback (`.htaccess`) in place
- [ ] `db:reset` run once, then only `migrate` on upgrades
