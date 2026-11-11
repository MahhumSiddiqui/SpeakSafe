import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { audit } from './lib/audit.js';

const app = createApp();

const server = app.listen(config.PORT, async () => {
  console.log(`SpeakSafe API listening on http://localhost:${config.PORT}`);
  try {
    await audit({ actorType: 'SYSTEM', action: 'SERVER_STARTED' });
  } catch (e) {
    console.error('Could not write to the audit log. Is the database migrated?');
  }
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
