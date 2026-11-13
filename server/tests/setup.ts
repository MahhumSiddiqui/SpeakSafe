import 'dotenv/config';

// Safety guard: these tests create records, and SpeakSafe's database never allows records to be deleted.
// So they must only ever run against a throwaway LOCAL test database, never the real (e.g. Neon) one.
const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || process.env.SPEAKSAFE_TEST_DB !== 'yes') {
  throw new Error(
    'Refusing to run tests: they need a separate local test database (set SPEAKSAFE_TEST_DB=yes and a localhost DATABASE_URL). Your real database is safe.',
  );
}
