// Demo data only (NFR-22): categories, reply templates and test staff accounts.
import { PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const categories = [
  'Harassment',
  'Discrimination',
  'Academic misconduct',
  'Fraud or financial misconduct',
  'Safety concern',
  'Other',
];

const templates = [
  { title: 'Report received', body: 'Thank you for your report. We have received it and a committee member is reviewing it. You can check this page for updates.' },
  { title: 'More details needed', body: 'Thank you for sharing this. To help us understand what happened, could you tell us more about when and where it took place? Only share what you are comfortable with.' },
  { title: 'Inquiry started', body: 'We have started a formal inquiry into this concern. We will update you here as it progresses.' },
];

const staff: { email: string; displayName: string; role: Role }[] = [
  { email: 'admin@speaksafe.test', displayName: 'Demo Admin', role: 'ADMIN' },
  { email: 'handler1@speaksafe.test', displayName: 'Committee Member 1', role: 'HANDLER' },
  { email: 'handler2@speaksafe.test', displayName: 'Committee Member 2', role: 'HANDLER' },
  { email: 'handler3@speaksafe.test', displayName: 'Committee Member 3', role: 'HANDLER' },
];

async function main() {
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  if ((await prisma.replyTemplate.count()) === 0) {
    await prisma.replyTemplate.createMany({ data: templates });
  }

  const password = process.env.SEED_PASSWORD ?? `Demo-${randomBytes(6).toString('base64url')}`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const created: string[] = [];
  for (const s of staff) {
    const exists = await prisma.user.findUnique({ where: { email: s.email } });
    if (!exists) {
      await prisma.user.create({ data: { ...s, passwordHash } });
      created.push(s.email);
    }
  }

  console.log(`Categories: ${categories.length}, reply templates: ${await prisma.replyTemplate.count()}`);
  if (created.length) {
    console.log('\nDemo staff accounts created (TEST DATA ONLY):');
    for (const e of created) console.log(`  ${e}`);
    console.log(`  Password for all: ${password}`);
    console.log('  MFA setup happens at first login.\n');
  } else {
    console.log('Demo staff accounts already exist; nothing changed.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
