import express from 'express';
import { applySecurity } from './middleware/security.js';
import { errorHandler, notFound } from './middleware/error.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();
  applySecurity(app);

  app.use('/api/health', healthRouter);
  // Feature routes (reports, cases, auth, admin) are added here step by step.

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
