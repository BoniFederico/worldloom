import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('shell applicativa', () => {
  test('la lingua segue Accept-Language e si può cambiare con persistenza', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-GB' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();

    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('button', { name: 'IT' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await context.close();
  });

  test('il tema è un unico bottone che cicla sistema → chiaro → scuro e persiste', async ({
    page,
  }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Sistema' });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Chiaro' })).toBeVisible();

    await page.getByRole('button', { name: 'Chiaro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Scuro' })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('senza preferenze il tema segue il sistema', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 23, 25)');
  });

  test('nessuno scroll orizzontale e tastiera utilizzabile', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Vai al contenuto' })).toBeFocused();
  });

  for (const locale of ['it-IT', 'en-GB']) {
    test(`senza violazioni gravi di accessibilità con la shell (${locale})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ locale });
      const page = await context.newPage();
      await page.goto('/');
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
        [],
      );
      await context.close();
    });
  }
});
