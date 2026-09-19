import { expect, test } from '@playwright/test';

// Le baseline esistono solo per Linux (vedi update-snapshots.yml): altrove il confronto non ha senso.
test.skip(process.platform !== 'linux', 'baseline generate solo su Linux');

for (const scheme of ['light', 'dark'] as const) {
  test(`home ${scheme} @screenshot`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page).toHaveScreenshot(`home-${scheme}.png`, { fullPage: true });
  });
}
