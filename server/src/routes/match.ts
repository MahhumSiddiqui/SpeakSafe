import { Router } from 'express';
import { z } from 'zod';
import { requireReporter } from '../lib/reporterSession.js';
import { evaluateBlinded } from '../lib/oprf.js';
import { matchIpLimiter, matchLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/error.js';

// The OPRF step of "Not alone" matching. Only a blinded point arrives here: the person's ID never does.
export const matchRouter = Router();
matchRouter.use(requireReporter);

matchRouter.post('/evaluate', matchIpLimiter, matchLimiter, async (req, res, next) => {
  try {
    const { blinded } = z.object({ blinded: z.string().length(44).regex(/^[A-Za-z0-9+/]+=$/) }).parse(req.body);
    const out = await evaluateBlinded(new Uint8Array(Buffer.from(blinded, 'base64')));
    if (!out) throw new HttpError(400, 'Invalid request.');
    res.json({ evaluated: Buffer.from(out).toString('base64') });
  } catch (e) {
    next(e);
  }
});
