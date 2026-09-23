import { expect, test } from '@playwright/test';

/**
 * Budget di prestazioni (#46): LCP < 2,5 s sulla pagina più pesante della prova di carico di `supabase/seed.sql`
 * (5.000 snippet, elenco limitato ai primi 200 — vedi D-022), non su un mondo vuoto: un budget verificato solo
 * con dati sintetici realistici è l'unico che dice qualcosa di utile.
 */
test('elenco snippet della prova di carico: LCP sotto 2,5 s', async ({ page }) => {
  await page.addInitScript(() => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries.at(-1);
      if (last) (window as unknown as { __lcp: number }).__lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@worldloom.test');
  await page.getByLabel('Password', { exact: true }).fill('Demo-Worldloom-1');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/worlds');
  await page.getByRole('link', { name: /Prova di carico/ }).click();
  await page.waitForURL(/\/worlds\/[0-9a-f-]{36}$/);
  const worldUrl = new URL(page.url()).pathname;

  await page.goto(`${worldUrl}/snippets`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const lcp = await page.evaluate(() => (window as unknown as { __lcp?: number }).__lcp);
  expect(lcp).not.toBeUndefined();
  expect(lcp as number).toBeLessThan(2500);
});
