import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { config } from './config.js';
import { pool } from './db/pool.js';
import { getAllAirports, getAllAircraft, hasApiKey } from './ivao/dataApi.js';
import { errorHandler, notFound } from './middleware/error.js';

import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/events.routes.js';
import eventTypeRoutes from './routes/eventTypes.routes.js';
import slotRoutes from './routes/slots.routes.js';
import liveRoutes from './routes/live.routes.js';
import emailRoutes from './routes/emails.routes.js';
import sceneryRoutes from './routes/sceneries.routes.js';
import simulatorRoutes from './routes/simulators.routes.js';
import userRoutes from './routes/users.routes.js';
import airportRoutes from './routes/airports.routes.js';
import referenceRoutes from './routes/reference.routes.js';
import customRoutes from './routes/custom.routes.js';
import reportRoutes from './routes/reports.routes.js';

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: false }));

// In development, accept any loopback origin (localhost / 127.0.0.1 / [::1] on any port)
// so it doesn't matter which host or Vite port the dev server ends up on.
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const isAllowedOrigin = (origin) => {
  if (config.clientOrigins.includes(origin)) return true;
  return config.env !== 'production' && LOOPBACK_ORIGIN.test(origin);
};

app.use(
  cors({
    origin(origin, cb) {
      // Allow no-origin (curl/mobile apps) and permitted browser origins.
      // Reject with `false` (no CORS headers) rather than an Error so the browser
      // gets a clean block instead of a 500 from the error handler.
      if (!origin || isAllowedOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (config.env !== 'test') app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// Rate-limit only the login endpoints (brute-force surface). Read-only auth routes
// like /auth/me and /auth/config are hit on every page load, so throttling them would
// intermittently log active users out; they are intentionally excluded.
const loginLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/auth/dev', loginLimiter);
app.use('/auth/ivao', loginLimiter);

// Airline logos (PNG named by airline ICAO, e.g. /airline-logo/AAL.png). Missing
// airlines simply 404 and the client hides the image.
app.use(
  '/airline-logo',
  express.static(path.join(__dirname, 'banners'), { maxAge: '7d', immutable: true, index: false })
);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', division: config.division, time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

// Self-documenting API index at the root (GET /). A lightweight, Swagger-style
// reference: JSON for API clients, a simple HTML page for browsers.
const API_INFO = {
  name: 'BYBLOS API',
  description: 'Flight Booking System by IVAO Lebanon',
  auth: 'Bearer JWT: Authorization: Bearer <token>',
  groups: {
    Health: ['GET  /health'],
    Auth: [
      'GET  /auth/config                     public OAuth config',
      'POST /auth/ivao                       exchange IVAO code for a session JWT',
      'POST /auth/dev                        dev login (dev only)',
      'GET  /auth/me                         current user',
    ],
    Events: [
      'GET    /event                         list (public: upcoming; admin: ?showAll=true)',
      'GET    /event/:id                     single event',
      'POST   /event                         create (admin)',
      'PUT    /event/:id                     update, with reconcile (admin)',
      'DELETE /event/:id                     delete (admin)',
      'GET    /event/ivao/import             IVAO events for this division (admin)',
      'GET    /event/:id/live                live network overlay',
      'GET    /event/:id/export              bookings CSV (admin)',
    ],
    Slots: [
      'GET   /event/:id/slot                 list slots (filters)',
      'GET   /event/:id/slot/mine            my slots',
      'GET   /event/:id/slot/count           counts by type',
      'POST  /event/:id/slot                 create (admin)',
      'POST  /event/:id/slot/many            CSV import (admin)',
      'GET   /event/:id/slot/overlapping     overlap report (admin)',
      'GET   /event/:id/slot/template        CSV template (admin)',
      'POST  /event/:id/slot/bulk            bulk actions (admin)',
      'PATCH /slot/:id/book|cancel|confirm   booking actions',
      'PUT   /slot/:id  ·  DELETE /slot/:id   edit / delete (admin)',
    ],
    Email: [
      'GET  /event/:id/email/status          counts + defaults + log (admin)',
      'POST /event/:id/email/preview         HTML preview (admin)',
      'POST /event/:id/email/send            send reminder/confirmReminder/notam/cancellation (admin)',
      'POST /event/:id/email/test            send a test to yourself (admin)',
      'GET  /event/:id/email/:eid/recipients per-recipient result (admin)',
    ],
    Reference: [
      'GET /airport?search=                  airport typeahead (custom + IVAO)',
      'GET /airport/:icao/brief              airport + METAR/TAF',
      'GET /ref/aircraft?search=             aircraft typeahead',
      'GET /ref/aircraft/:icao               single aircraft type',
      'GET /ref/route?dep=&arr=              IVAO published routes',
      'GET /ref/livery?airline=&aircraft=    livery lookup',
    ],
    'Custom data (admin)': [
      'GET POST /custom/airport   ·  PUT DELETE /custom/airport/:icao',
      'GET POST /custom/aircraft  ·  PUT DELETE /custom/aircraft/:icao',
    ],
    Lookups: [
      'GET /event-type  ·  /scenery  ·  /simulator',
      'GET /user (admin)  ·  GET /stats (admin)',
    ],
  },
};

app.get('/', (req, res) => {
  const info = { ...API_INFO, division: config.division };
  if (!String(req.headers.accept || '').includes('text/html')) return res.json(info);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sections = Object.entries(info.groups)
    .map(([title, items]) => `<h2>${esc(title)}</h2><pre>${items.map(esc).join('\n')}</pre>`)
    .join('');
  res.type('html').send(
    `<!doctype html><meta charset="utf-8"><title>${esc(info.name)}</title>` +
      `<style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#191a23}` +
      `h1{margin:0}h2{margin:1.4rem 0 .3rem;color:#0D2C99;font-size:15px}` +
      `pre{background:#f4f5fa;border-radius:8px;padding:.8rem 1rem;overflow:auto;font-size:12.5px}` +
      `.sub{color:#606282;margin:.2rem 0 1rem}a{color:#1037BF}</style>` +
      `<h1>${esc(info.name)}</h1><p class="sub">${esc(info.description)} · IVAO ${esc(info.division)} · ${esc(info.auth)}</p>` +
      sections
  );
});

app.use('/auth', authRoutes);
app.use('/event-type', eventTypeRoutes);
app.use('/event', eventRoutes);
app.use('/scenery', sceneryRoutes);
app.use('/simulator', simulatorRoutes);
app.use('/user', userRoutes);
app.use('/airport', airportRoutes);
app.use('/ref', referenceRoutes);
app.use('/custom', customRoutes);
app.use('/', slotRoutes); // /event/:id/slot* and /slot/*
app.use('/', liveRoutes); // /event/:id/live
app.use('/', emailRoutes); // /event/:id/email/*
app.use('/', reportRoutes); // /event/:id/export, /stats

app.use(notFound);
app.use(errorHandler);

// Keep event status in sync with the clock: a scheduled event whose end time has
// passed is automatically marked finished. Runs on boot and every minute.
async function autoAdvanceEventStatus() {
  try {
    await pool.query("UPDATE events SET status='finished' WHERE status='scheduled' AND dateEnd < UTC_TIMESTAMP()");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('auto event-status update failed:', err.message);
  }
}

async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Cannot connect to MySQL. Is it running and migrated?');
    console.error(`   ${err.message}`);
    process.exit(1);
  }
  await autoAdvanceEventStatus();
  setInterval(autoAdvanceEventStatus, 60_000);
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`🛫 BYBLOS · IVAO ${config.division} API listening on http://localhost:${config.port}`);
  });
  // Warm the IVAO airport/aircraft catalogues into memory (no DB storage) so the
  // first typeahead search is instant. Fetched from the IVAO API; cached 24h and
  // refreshed lazily on demand. Never blocks startup.
  if (hasApiKey()) {
    getAllAirports().then((l) => console.log(`✈️  ${l.length} airports available from IVAO`)).catch(() => {});
    getAllAircraft().then((l) => console.log(`🛩️  ${l.length} aircraft available from IVAO`)).catch(() => {});
  }
}

start();
