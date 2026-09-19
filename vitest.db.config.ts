import { defineConfig } from 'vitest/config';

// Test di integrazione contro Postgres reale (Supabase locale o service container in CI).
export default defineConfig({
  test: { include: ['db-tests/**/*.test.ts'], fileParallelism: false, testTimeout: 20_000 },
});
