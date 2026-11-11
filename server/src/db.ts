import { PrismaClient } from '@prisma/client';

// One shared client. Query logging is off so no request data ends up in logs.
export const prisma = new PrismaClient({ log: ['warn', 'error'] });
