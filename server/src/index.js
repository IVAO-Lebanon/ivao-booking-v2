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
import { sendDueConfirmReminders } from './services/confirmReminders.js';
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

// Basic rate-limiting on auth to slow brute force.
app.use('/auth', rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }));

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

app.use('/auth', authRoutes);
app.use('/event-type', eventTypeRoutes);
app.use('/event', eventRoutes);
app.use('/scenery', sceneryRoutes);
app.use('/simulator', simulatorRoutes);
app.use('/user', userRoutes);
app.use('/airport', airportRoutes);
app.use('/ref', referenceRoutes);
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
  await sendDueConfirmReminders();
  setInterval(autoAdvanceEventStatus, 60_000);
  setInterval(sendDueConfirmReminders, 60_000);
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
