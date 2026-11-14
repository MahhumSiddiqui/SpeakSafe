import express from 'express';
import { applySecurity } from './middleware/security.js';
import { errorHandler, notFound } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { reporterRouter } from './routes/reporter.js';
import { reporterDataRouter } from './routes/reporterData.js';
import { journalRouter } from './routes/journal.js';
import { matchRouter } from './routes/match.js';
import { reportsRouter } from './routes/reports.js';
import { publicRouter } from './routes/public.js';
import { staffAuthRouter } from './routes/staffAuth.js';
import { staffCasesRouter } from './routes/staffCases.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();
  applySecurity(app);

  app.use('/api/health', healthRouter);
  app.use('/api', publicRouter);
  app.use('/api/reporter', reporterRouter);
  app.use('/api/reporter', reporterDataRouter);
  app.use('/api/reporter/journal', journalRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/match', matchRouter);
  app.use('/api/staff', staffAuthRouter);
  app.use('/api/staff/cases', staffCasesRouter);
  app.use('/api/admin', adminRouter);
  // Further feature routes (reports, cases, staff, admin) are added here step by step.

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
