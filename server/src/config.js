import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

export const config = {
  port: Number(process.env.PORT || 4000),
  env,
  // Allowed browser origins for CORS. Trailing slashes are stripped so a value
  // like "https://site/" still matches the Origin header (which has none).
  clientOrigins: (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'ivao',
    // Empty string is a valid password (common on local XAMPP/MAMP root), so use ?? not ||.
    password: process.env.DB_PASSWORD ?? 'ivao',
    database: process.env.DB_NAME || 'ivao_booking',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },

  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // Dev login (POST /auth/dev) issues a session for any VID, including admin, so
  // it is ALWAYS disabled in production regardless of DEV_AUTH. This way a
  // forgotten env var can never expose an open admin login on a live server.
  devAuth: isProd ? false : bool(process.env.DEV_AUTH, true),

  ivao: {
    openidConfig: process.env.IVAO_OPENID_CONFIG || 'https://api.ivao.aero/.well-known/openid-configuration',
    apiEndpoint: process.env.IVAO_API_ENDPOINT || 'https://api.ivao.aero/v2',
    clientId: process.env.IVAO_CLIENT_ID || '',
    clientSecret: process.env.IVAO_CLIENT_SECRET || '',
    apiKey: process.env.IVAO_API_KEY || '',
  },

  email: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'BYBLOS <no-reply@ivao.aero>',
    eventsDept: process.env.EVENTS_DEPT_EMAIL || '',
    // Accept a self-signed / mismatched TLS cert (e.g. SMTP_HOST=localhost).
    allowInvalidCert: bool(process.env.SMTP_ALLOW_INVALID_CERT, false),
  },

  division: process.env.IVAO_DIVISION || 'LB',
  authorizedStaffPositions: (process.env.AUTHORIZED_STAFF_POSITIONS || 'DIR,AOC,XA0')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  rules: {
    confirmMaxDaysBefore: Number(process.env.CONFIRM_MAX_DAYS_BEFORE || 7),
    autoBookWithinDays: Number(process.env.AUTO_BOOK_WITHIN_DAYS || 2),
    maxEventHours: Number(process.env.MAX_EVENT_HOURS || 10),
  },
};

// Production safety checks. A weak JWT secret lets anyone forge admin sessions,
// so refuse to start rather than run a silently insecure server. CORS and login
// misconfigurations are only warnings (they fail loudly and visibly at runtime).
if (isProd) {
  const fatal = [];
  if (!process.env.JWT_SECRET || config.jwtSecret.includes('change-me') || config.jwtSecret.length < 32) {
    fatal.push('JWT_SECRET must be set to a strong random value (32+ characters).');
  }

  if (fatal.length) {
    // eslint-disable-next-line no-console
    console.error('❌ Refusing to start: insecure production configuration:');
    for (const p of fatal) console.error(`   - ${p}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  if (bool(process.env.DEV_AUTH, false)) console.warn('⚠️  DEV_AUTH is ignored in production; dev login stays disabled.');
  if (!process.env.CLIENT_ORIGINS) console.warn('⚠️  CLIENT_ORIGINS is not set; browsers on your real site will be blocked by CORS.');
  if (!config.ivao.clientId) console.warn('⚠️  IVAO_CLIENT_ID is not set; with dev login disabled, no one can sign in.');
}
