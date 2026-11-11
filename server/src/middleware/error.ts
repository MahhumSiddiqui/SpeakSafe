import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isProd } from '../config.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

// NFR-28: say what happened in plain words; never leak stack traces or internals.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Some information is missing or in the wrong format.',
      fields: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'That upload is too large.' });
    return;
  }
  console.error(isProd ? `Unhandled error: ${err?.message}` : err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
};
