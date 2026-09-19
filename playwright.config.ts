import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

const port = 3100;

/** Gli e2e usano sempre il Supabase locale (npm run db:start), mai le chiavi di .env.local. */
function localSupabaseEnv(): Record<string, string> {
  const raw = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const values: Record<string, string> = {};
  for (const match of raw.matchAll(/^(\w+)="?([^"\r\n]*)"?$/gm)) {
    values[match[1] as string] = match[2] as string;
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY ?? '',
  };
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: { baseURL: `http://localhost:${port}`, locale: 'it-IT', trace: 'on-first-retry' },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  // Le baseline degli screenshot si generano solo su Linux (CI): {platform} li tiene separati.
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}-{projectName}{ext}',
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: localSupabaseEnv(),
  },
});
