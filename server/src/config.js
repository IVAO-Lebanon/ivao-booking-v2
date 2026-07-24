import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  clientOrigins: (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
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

  devAuth: bool(process.env.DEV_AUTH, true),

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
    from: process.env.MAIL_FROM || 'IVAO Booking <no-reply@ivao.aero>',
    eventsDept: process.env.EVENTS_DEPT_EMAIL || '',
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

if (config.env === 'production' && config.jwtSecret.includes('change-me')) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  JWT_SECRET is not set to a secure value in production!');
}
