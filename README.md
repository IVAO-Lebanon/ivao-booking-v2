# IVAO Lebanon — Booking System

A ground-up rebuild of an IVAO division event-booking platform, using **React + Node.js + MySQL**.
It is *inspired by* an older Laravel/PHP + multi-repo system: the ideas and features were reimplemented
cleanly on a new stack, the known bugs were fixed, and several improvements were added.

Pilots browse division events, book flight slots (with pilot-fillable or staff-fixed fields), pre-book /
confirm, and manage their bookings. **Staff administration is built into the same app** — the Admin area
appears automatically for users whose IVAO staff position + division authorize them (no separate admin site).

---

## Stack

| Layer     | Technology                                                          |
| --------- | ------------------------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query |
| Backend   | Node.js, Express, Zod, JWT (`jsonwebtoken`), Multer, Helmet         |
| Database  | MySQL 8 / MariaDB 10.4+ (`mysql2`, parameterized queries)           |
| Auth      | IVAO OpenID Connect (SSO) in production · dev-login for local work  |

Mobile-first responsive UI, light/dark theme, live UTC (Zulu) clock.

---

## Quick start (local)

Prerequisites: **Node 18+** and a running **MySQL/MariaDB** (local, XAMPP/MAMP, or `docker compose up -d`).

```bash
# 1) API
cd server
cp .env.example .env         # edit DB_* to match your MySQL (root/empty works for XAMPP)
npm install
npm run db:reset             # create schema + seed demo data
npm run dev                  # → http://localhost:4000

# 2) Web app (second terminal)
cd client
cp .env.example .env
npm install
npm run dev                  # → http://localhost:5173
```

Open **http://localhost:5173**.

### Demo logins (dev mode)

The login page shows a **Developer login** panel when `DEV_AUTH=true`.

| Role          | VID    |
| ------------- | ------ |
| Division staff (admin) | `540001` |
| Pilot         | `540002`, `540003` |

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
`<DIVISION>-<PATTERN>`, where a `0` in a pattern is a numeric wildcard (`XA0` → `XA1`, `XA2`, …).
The client redirects to IVAO's authorize endpoint; the callback exchanges the code server-side.

---

## Features

**Pilots**
- Browse events (cards, banners, type, status, countdown) — responsive grid.
- Event detail: description, briefings, ATC booking link, airports, recommended sceneries, live slot counts.
- Slot list with filters: *available only*, flight-number search, and (for RFO events) Departures / Arrivals / Private.
- **Book** open slots (only the non-fixed fields are editable), **cancel**, and **confirm** pre-booked slots.
- Auto-book vs. pre-book is decided by how close the event is (configurable windows).
- "My bookings" across all events.

**Staff (integrated admin)**
- Dashboard with live stats.
- Event CRUD (create/edit/delete with validation and airport management).
- Per-event slot tools: create, **CSV bulk import** (validated), **CSV export**, delete, and an **overlap report**.
- Scenery and aircraft management.
- Pilot management: search, suspend / reinstate.

---

## What changed vs. the original (bugs fixed + improvements)

**Correctness fixes**
- **Slot overlap detection actually works.** The original `checkOverlappingSlots` was stubbed to always
  return `false`; here it's real time-window logic (used both when booking and in the staff overlap report).
- **CSV bulk import is authorized and safe.** The original endpoint had no admin check and inserted raw CSV
  columns (mass-assignment). Here it's admin-only, every row is validated with Zod, and only whitelisted
  columns are written.
- **No crashes on non-RFO events.** The original slot-rule fallback had an incompatible signature that fatally
  errored for `rfe`/`msa`; rules now share one interface.
- **Robust 404s.** Missing events/slots return proper 404s instead of dereferencing null.
- **base64url-safe** JWT decoding, and **anchored** staff-position matching (no accidental partial matches).
- **Double-booking race prevented** via a transaction + `SELECT … FOR UPDATE` on the slot row.

**Improvements / additions**
- Single integrated app (admin merged into the main site via role/division) instead of three repos.
- Parameterized SQL everywhere; Helmet, CORS allow-list, and auth rate-limiting.
- Zod validation on every write; friendly, mapped error messages in the UI.
- Audit log table for staff actions.
- Mobile-first responsive design, dark mode, toasts, UTC clock, CSV template download, dashboard stats.
- Efficient "missing aircraft" query (original loaded the whole slots table into memory).

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
POST   /auth/ivao                     exchange IVAO code → session JWT
GET    /auth/me                       current user
GET    /event                         list (public: upcoming; admin: ?showAll=true)
POST   /event                         create (admin)
GET    /event/:id                     single event (+ airports, sceneries, state)
PUT    /event/:id · DELETE /event/:id  (admin)
GET    /event/:id/slot                list slots (filters: available, type, flightNumber…)
GET    /event/:id/slot/mine           my slots
GET    /event/:id/slot/count          counts by type
POST   /event/:id/slot                create (admin)
POST   /event/:id/slot/many           CSV bulk import (admin)
GET    /event/:id/slot/overlapping    overlap report (admin)
GET    /event/:id/slot/template       CSV template (admin)
PATCH  /slot/:id/book|cancel|confirm  booking actions
PUT/DELETE /slot/:id                   (admin)
GET    /event/:id/export              CSV export (admin)
GET    /scenery · /aircraft · /user · /stats · /airport/details/:icao
GET    /health
```

_Times are handled in UTC (Zulu) throughout. Not affiliated with real-world aviation._
