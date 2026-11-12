// DEMO SETUP ONLY: gives the seeded committee accounts their encryption key pairs.
// In normal use each member creates their key pair in their own browser at first login (Feature 3);
// this script does exactly the same steps, for the demo accounts, so reports can be tested now.
// The private key is stored ONLY encrypted with a key derived from the member's password (Argon2id).
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import _sodium from 'libsodium-wrappers-sumo';
import { createInterface } from 'node:readline';

const prisma = new PrismaClient();

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) out.output.write(s);
      else out.output.write('*');
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  await _sodium.ready;
  const s = _sodium;
  const V = s.base64_variants.ORIGINAL;
  const handlers = await prisma.user.findMany({ where: { role: 'HANDLER', active: true, publicKey: null } });
  if (!handlers.length) {
    console.log('All committee accounts already have encryption keys. Nothing to do.');
    return;
  }
  const password = process.env.STAFF_PASSWORD ?? (await askHidden('Demo staff password (from the seed step): '));
  for (const h of handlers) {
    if (!(await argon2.verify(h.passwordHash, password))) {
      console.log(`  ${h.email}: password does not match, skipped.`);
      continue;
    }
    const kp = s.crypto_box_keypair();
    const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
    const root = s.crypto_pwhash(32, password.normalize('NFKC'), salt, s.crypto_pwhash_OPSLIMIT_INTERACTIVE, s.crypto_pwhash_MEMLIMIT_INTERACTIVE, s.crypto_pwhash_ALG_ARGON2ID13);
    const wrap = s.crypto_kdf_derive_from_key(32, 2, 'ss_wrap_', root);
    const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
    const ct = s.crypto_secretbox_easy(kp.privateKey, nonce, wrap);
    const box = new Uint8Array(nonce.length + ct.length);
    box.set(nonce);
    box.set(ct, nonce.length);
    await prisma.user.update({
      where: { id: h.id },
      data: { publicKey: s.to_base64(kp.publicKey, V), encryptedPrivateKey: s.to_base64(box, V), keySalt: s.to_base64(salt, V) },
    });
    s.memzero(kp.privateKey);
    s.memzero(root);
    console.log(`  ${h.email}: encryption keys created.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
