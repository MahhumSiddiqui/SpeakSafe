import { Router } from 'express';
import { prisma } from '../db.js';

// Information anyone may see: report categories, and the committee members a reporter can choose to exclude.
export const publicRouter = Router();

publicRouter.get('/categories', async (_req, res, next) => {
  try {
    res.json(await prisma.category.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { id: 'asc' } }));
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/committee', async (_req, res, next) => {
  try {
    const members = await prisma.user.findMany({
      where: { role: 'HANDLER', active: true, publicKey: { not: null } },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
    res.json(members);
  } catch (e) {
    next(e);
  }
});
