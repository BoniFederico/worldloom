import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createWorld, registerAndSignIn } from './session';

test.describe('mondi', () => {
  test('senza accesso si viene portati al login', async ({ page }) => {
    await page.goto('/worlds');
    await expect(page).toHaveURL(/\/login\?next=%2Fworlds/);
  });

  test('stato vuoto, creazione e comparsa nell’elenco', async ({ page }) => {
    await registerAndSignIn(page);
    await page.goto('/worlds');
    await expect(page.getByText('Non hai ancora nessun mondo')).toBeVisible();

    await createWorld(page, 'Aurelia');
    await expect(page.getByText('Proprietario')).toBeVisible();

    await page.goto('/worlds');
    await expect(page.getByRole('link', { name: 'Aurelia' })).toBeVisible();
    await expect(page.getByText('Non hai ancora nessun mondo')).toBeHidden();
  });

  test('un nome vuoto viene rifiutato', async ({ page }) => {
    await registerAndSignIn(page);
    await page.goto('/worlds');
    await page.getByLabel('Nome del mondo').fill('   ');
    await page.getByRole('button', { name: 'Crea mondo' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('da 1 a 120 caratteri');
  });

  test('un altro utente non vede né apre il mondo (isolamento)', async ({ browser }) => {
    const owner = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(owner, 'Proprietaria');
    const worldId = await createWorld(owner, 'Segretissimo');

    const outsider = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(outsider, 'Estraneo');
    await outsider.goto('/worlds');
    await expect(outsider.getByText('Segretissimo')).toBeHidden();
    const res = await outsider.goto(`/worlds/${worldId}`);
    expect(res?.status()).toBe(404);
    const settings = await outsider.goto(`/worlds/${worldId}/settings`);
    expect(settings?.status()).toBe(404);
  });

  test('un identificativo non valido dà 404', async ({ page }) => {
    await registerAndSignIn(page);
    const res = await page.goto('/worlds/non-un-uuid');
    expect(res?.status()).toBe(404);
  });

  test('rinomina ed eliminazione con conferma', async ({ page }) => {
    await registerAndSignIn(page);
    const worldId = await createWorld(page, 'Vecchio nome');
    await page.getByRole('link', { name: 'Impostazioni' }).click();

    await page.getByLabel('Nome del mondo').fill('Nuovo nome');
    await page.getByRole('button', { name: 'Rinomina' }).click();
    await expect(page.getByRole('status')).toHaveText('Nome aggiornato.');
    await expect(page.getByLabel('Nome del mondo')).toHaveValue('Nuovo nome');

    await page.getByRole('button', { name: 'Elimina il mondo' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Spunta la conferma');

    await page.getByLabel('Voglio eliminare «Nuovo nome»').check();
    await page.getByRole('button', { name: 'Elimina il mondo' }).click();
    await expect(page).toHaveURL(/\/worlds\?notice=deleted/);
    await expect(page.getByRole('status')).toHaveText('Mondo eliminato.');
    const res = await page.goto(`/worlds/${worldId}`);
    expect(res?.status()).toBe(404);
  });

  test('accessibilità di elenco e impostazioni', async ({ page }) => {
    await registerAndSignIn(page);
    const worldId = await createWorld(page, 'Accessibile');
    for (const path of ['/worlds', `/worlds/${worldId}`, `/worlds/${worldId}/settings`]) {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
        [],
      );
    }
  });
});
