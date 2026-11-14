import { defineConfig } from 'vitest/config';
// Test files share the demo committee accounts, so they run one after another.
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'], fileParallelism: false } });
