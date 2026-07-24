import { ZodError } from 'zod';
import { config } from '../config.js';

export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 422, message: 'validation.failed', details: err.flatten() },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.status, message: err.message, details: err.details },
    });
  }

  // Multer / body-size errors expose a status.
  if (err?.status && err?.message) {
    return res.status(err.status).json({ error: { code: err.status, message: err.message } });
  }

  if (config.env !== 'production') {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  return res.status(500).json({ error: { code: 500, message: 'server.error' } });
}

export function notFound(_req, res) {
  res.status(404).json({ error: { code: 404, message: 'route.notFound' } });
}
