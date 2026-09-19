import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('la home mostra il nome del prodotto', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Worldloom' })).toBeVisible();
});

test('l’health check risponde ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`home senza violazioni gravi di accessibilità (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious).toEqual([]);
  });
}
