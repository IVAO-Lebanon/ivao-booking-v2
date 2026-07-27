# BYBLOS

**Flight Booking System by IVAO Lebanon.** A web platform for IVAO division event booking, built with **React + Node.js + MySQL**.

Pilots browse division events, book flight slots (with pilot-fillable or staff-fixed fields), pre-book and confirm, and manage their bookings. **Staff administration is built into the same app:** the Admin area appears automatically for users whose IVAO staff position and division authorize them (no separate admin site).

> **Ownership:** BYBLOS is owned and maintained by IVAO Lebanon. Other IVAO divisions may be granted limited permission to run their own instance, scoped to their own division code. See [Multi-division use](#multi-division-use) and the `LICENSE` file.

---

## Stack

| Layer     | Technology                                                            |
| --------- | -------------------------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query |
| Backend   | Node.js, Express, Zod, JWT (`jsonwebtoken`), Multer, Helmet          |
| Database  | MySQL 8 / MariaDB 10.4+ (`mysql2`, parameterized queries)            |
| Auth      | IVAO OpenID Connect (SSO) in production, dev-login for local work    |

Mobile-first responsive UI, light and dark theme, live UTC (Zulu) clock.

---

## Quick start (local)

Prerequisites: **Node 18+** and a running **MySQL/MariaDB** (local, XAMPP/MAMP, or `docker compose up -d`).

```bash
# 1) API
cd server
cp .env.example .env         # edit DB_* to match your MySQL (root/empty works for XAMPP)
npm install
npm run db:reset             # create schema + seed demo data
npm run dev                  # http://localhost:4000

# 2) Web app (second terminal)
cd client
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Open **http://localhost:5173**.

### Demo logins (dev mode)

The login page shows a **Developer login** panel when `DEV_AUTH=true`.

| Role                   | VID                |
| ---------------------- | ------------------ |
| Division staff (admin) | `540001`           |
| Pilot                  | `540002`, `540003` |

Tick *"Sign in as division staff"* to get the Admin area, or use a seeded VID.

---

## Production auth (IVAO SSO)

Set these in `server/.env` and set `DEV_AUTH=false`:

```
IVAO_CLIENT_ID=...
IVAO_CLIENT_SECRET=...
IVAO_API_KEY=...
IVAO_DIVISION=LB
AUTHORIZED_STAFF_POSITIONS=DIR,ADIR,AOC,...,XA0
```

A user is granted admin when one of their IVAO `userStaffPositions` matches
`<DIVISION>-<PATTERN>`, where a `0` in a pattern is a numeric wildcard (`XA0` matches `XA1`, `XA2`, and so on).
The client redirects to IVAO's authorize endpoint, and the callback exchanges the code server-side.

---

## Features

**Pilots**
- Browse events (cards, banners, type, status, countdown) in a responsive grid.
- Event detail: description, briefings, ATC booking link, airports, recommended sceneries, live slot counts.
- Slot list with filters: *available only*, flight-number search, and (for RFO events) Departures, Arrivals, and Private.
- **Book** open slots (only the non-fixed fields are editable), **cancel**, and **confirm** pre-booked slots.
- Auto-book vs. pre-book is decided by how close the event is (configurable windows).
- "My bookings" across all events.

**Staff (integrated admin)**
- Dashboard with live stats.
- Event CRUD (create, edit, delete, with validation and airport management).
- Per-event slot tools: create, **CSV bulk import** (validated), **CSV export**, delete, and an **overlap report**.
- Scenery and aircraft management.
- Pilot management: search, suspend, and reinstate.

---

## Deployment (Plesk), step by step

This guide is written to be followed literally, with no prior Node.js hosting experience assumed. The app is **two separate deployables**:

1. **The API** (`server/`): a Node.js application.
2. **The web app** (`client/`): static files built from `client/`, served as a normal website.

A typical setup uses two domains or subdomains:

- `booking.<div>.ivao.aero` serves the web app.
- `api.booking.<div>.ivao.aero` serves the API.

Replace `<div>` with your division code in lower case (for example `lb`).

### Before you start

Make sure your Plesk server has:

- **Node.js** installed and enabled. In Plesk go to **Extensions** and confirm the **Node.js** extension is present. If not, install it (it is free).
- **MySQL** or **MariaDB** available (standard on most Plesk servers).
- **Git** deployment available (Plesk includes this by default).

You will also need, from IVAO:

- An **IVAO OAuth application** (Client ID and Client Secret).
- An **IVAO API key**.

If you do not have these yet, request them from IVAO HQ before going live. You can install everything first and add these values later.

### Step 1: Create the database

1. In Plesk, open **Databases**.
2. Click **Add Database**.
3. Name it, for example, `ivao_booking`.
4. Create a database user (for example `ivao_user`) and choose a strong password.
5. **Write down** the database name, user, password, host, and port. You will paste them into the API settings in Step 4.

### Step 2: Get the code onto the server

1. In Plesk, open the subscription (domain) that will host the **API** (`api.booking.<div>.ivao.aero`).
2. Open **Git**.
3. Click **Add Repository**, choose **Remote Git hosting**, and paste the repository URL:
   `https://github.com/IVAO-Lebanon/ivao-booking-v2.git`
4. Set the deployment path to the subscription's home directory (the default is fine).
5. Click **OK**, then **Pull Updates** so Plesk downloads the code.

You now have the full project on the server, including both the `server/` and `client/` folders.

### Step 3: Turn the API into a Node.js application

1. In the same subscription, open **Node.js**.
2. Set **Application Root** to `server`.
3. Set **Application Startup File** to `src/index.js`.
4. Set **Application Mode** to `production`.
5. Leave the page open. You will click **NPM Install** in Step 5.

### Step 4: Configure the API settings (.env)

1. In Plesk, open **File Manager** and go into the `server` folder.
2. Find the file named `.env.example`, copy it, and rename the copy to `.env`.
3. Open `.env` and set the values below. Everything after `#` is a comment you can ignore.

   ```env
   NODE_ENV=production
   DEV_AUTH=false                       # MUST be false in production
   PORT=4000                            # Plesk manages the real port; keep this as a fallback

   # Allowed website address (used for security). Use your web app address:
   CLIENT_ORIGINS=https://booking.<div>.ivao.aero

   # Database, from Step 1:
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=ivao_user
   DB_PASSWORD=the-password-you-chose
   DB_NAME=ivao_booking

   # Security: a long random string (32+ characters). Generate one by running
   # `openssl rand -hex 32` in a terminal and pasting the result here. In
   # production the API refuses to start if this is missing or left as a default.
   JWT_SECRET=change-this-to-a-long-random-string

   # Your division:
   IVAO_DIVISION=LB
   AUTHORIZED_STAFF_POSITIONS=DIR,ADIR,AOC,AOAC,EC,AEC,WM,AWM,TC,ATC,FTC,AFTC,XA0

   # IVAO credentials (paste when you have them):
   IVAO_CLIENT_ID=
   IVAO_CLIENT_SECRET=
   IVAO_API_KEY=
   ```
4. Save the file.

### Step 5: Install dependencies and set up the database

1. Go back to the **Node.js** page for this subscription.
2. Click **NPM Install** and wait for it to finish. This downloads the code the API needs to run.
3. Set up the database tables. On the same Node.js page there is a **Run Script** option:
   - In the script box type `db:reset` and run it. This creates the tables and adds starter data.
   - **Do this only on the very first deployment.** Running it again erases live data. For future updates use `migrate` instead (see [Updating](#updating-an-instance)).
4. Click **Restart App**.

Your API is now running. To confirm it works, visit `https://api.booking.<div>.ivao.aero/health` in a browser. You should see a short status response.

> **Important:** the API subdomain must serve **only** the Node app. It must NOT
> contain the web app's SPA `.htaccess` (the `RewriteRule . /index.html` from
> Step 6). If it does, requests like `/event` loop and Apache returns
> `AH00124: Request exceeded the limit of 10 internal redirects`. The API needs no
> rewrite rules at all; Passenger routes requests to Node.

### Step 6: Build and publish the web app

The web app is a set of static files that must be built once, then served.

1. In Plesk, open the subscription for the **web app** (`booking.<div>.ivao.aero`). This can be a separate subscription or subdomain pointing at the same code.
2. In **File Manager**, go into the `client` folder, copy `.env.example` to `.env`, and set:

   ```env
   # Full URL of the API host, with NO /api suffix (the API serves /event, /auth
   # at the root). Point it at the API subdomain, not the web app origin:
   VITE_API_BASE=https://api.booking.<div>.ivao.aero

   # Public IVAO client id (same value as IVAO_CLIENT_ID above):
   VITE_IVAO_CLIENT_ID=

   # Where IVAO sends users back after login:
   VITE_IVAO_REDIRECT_URI=https://booking.<div>.ivao.aero/login/callback
   ```
3. Build the web app. The simplest way is to add a temporary Node.js application for the `client` folder, click **NPM Install**, then **Run Script** with `build`. This produces a `client/dist` folder.

   (If your Plesk plan has SSH access, you can instead run `npm ci` then `npm run build` inside the `client` folder.)
4. Set the website's **document root** to `client/dist`:
   - Open **Hosting Settings** for the web app domain.
   - Change **Document root** to `client/dist` and save.
5. Add an `.htaccess` file inside `client/dist` so that page links do not show "Not Found". This belongs to the **web app only** (never the API subdomain, see the warning in Step 5). In **File Manager**, create a file named `.htaccess` in `client/dist` with exactly this content:

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

Open `https://booking.<div>.ivao.aero` in a browser. The site should load.

### Step 7: Connect IVAO login

1. In your IVAO OAuth application settings, set the redirect URI to:
   `https://booking.<div>.ivao.aero/login/callback`
2. Put the Client ID and Client Secret into `server/.env` (`IVAO_CLIENT_ID`, `IVAO_CLIENT_SECRET`) and the API key into `IVAO_API_KEY`.
3. Put the same public Client ID into `client/.env` (`VITE_IVAO_CLIENT_ID`), then rebuild the web app (Step 6, part 3).
4. Restart the API (**Node.js** page, **Restart App**).

Login now goes through IVAO SSO. Staff members whose IVAO position matches `AUTHORIZED_STAFF_POSITIONS` see the Admin area automatically.

### Updating an instance

When a new version is released:

1. In **Git**, click **Pull Updates**.
2. API: on the **Node.js** page, click **NPM Install**, then **Run Script** with `migrate` (this updates the database **without** erasing data), then **Restart App**.
3. Web app: run the `build` script again (Step 6, part 3). The new files replace the old ones in `client/dist`.

Never run `db:reset` on a live instance. It rebuilds the database from scratch and deletes bookings. Use `migrate` for updates.

### Deployment checklist

- [ ] Database created; API `.env` filled in (division, database, JWT secret, IVAO credentials)
- [ ] `DEV_AUTH=false` and `NODE_ENV=production`
- [ ] `CLIENT_ORIGINS` matches the web app address
- [ ] IVAO OAuth redirect URI set to `.../login/callback`
- [ ] `IVAO_DIVISION` and `AUTHORIZED_STAFF_POSITIONS` set for your division
- [ ] Web app built with the correct `VITE_API_BASE` and redirect URI
- [ ] `.htaccess` present in `client/dist`
- [ ] `db:reset` run once on first deploy, then only `migrate` on updates

---

## Multi-division use

BYBLOS is one shared codebase, owned by IVAO Lebanon. Each division runs its **own** instance and points it at their division through configuration, not by copying or forking the code:

- `IVAO_DIVISION=<code>` (your two-letter IVAO division code)
- `AUTHORIZED_STAFF_POSITIONS=...` (which staff positions may administer it)
- your own IVAO OAuth application and API key
- your own database and secrets

Changes to the shared code go through IVAO Lebanon by pull request, so there is one maintained core with per-division instances. See the `LICENSE` file for the exact terms.

---

## Project layout

```
ivao-booking-v2/
├── server/                 # Express + MySQL API
│   └── src/
│       ├── index.js        # app wiring
│       ├── config.js
│       ├── db/             # pool, schema.sql, migrate, seed
│       ├── auth/           # jwt, ivao (OAuth + staff-role logic)
│       ├── middleware/     # auth, error
│       ├── utils/          # overlap, slotRules, eventState, pagination, csv, audit
│       ├── validation/     # zod schemas
│       └── routes/         # auth, events, slots, sceneries, aircraft, users, airports, reports
└── client/                 # React + Vite SPA
    └── src/
        ├── api/            # typed API client + types
        ├── auth/           # AuthContext (JWT session)
        ├── components/     # Layout, SlotList, modals, UI kit, Toast
        ├── lib/            # theme, date/format helpers
        └── pages/          # events, event detail, my bookings, login, admin/*
```

## API overview

```
POST   /auth/dev                      dev login (DEV_AUTH only)
POST   /auth/ivao                     exchange IVAO code for a session JWT
GET    /auth/me                       current user
GET    /event                         list (public: upcoming; admin: ?showAll=true)
POST   /event                         create (admin)
GET    /event/:id                     single event (with airports, sceneries, state)
PUT    /event/:id, DELETE /event/:id  (admin)
GET    /event/:id/slot                list slots (filters: available, type, flightNumber)
GET    /event/:id/slot/mine           my slots
GET    /event/:id/slot/count          counts by type
POST   /event/:id/slot                create (admin)
POST   /event/:id/slot/many           CSV bulk import (admin)
GET    /event/:id/slot/overlapping    overlap report (admin)
GET    /event/:id/slot/template       CSV template (admin)
PATCH  /slot/:id/book|cancel|confirm  booking actions
PUT/DELETE /slot/:id                  (admin)
GET    /event/:id/export              CSV export (admin)
GET    /scenery, /aircraft, /user, /stats, /airport/details/:icao
GET    /health
```

Times are handled in UTC (Zulu) throughout.
