import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PASSWORD, uniqueEmail } from './mail';
import { createWorld, registerAndSignIn } from './session';

test.describe('GDPR: informativa, consenso, esportazione e cancellazione account', () => {
  test('la pagina informativa è accessibile e senza consenso la registrazione è rifiutata', async ({
    page,
  }) => {
    await page.goto('/privacy');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Informativa sulla privacy' }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);

    const email = uniqueEmail('nocheck');
    await page.goto('/signup');
    await page.getByLabel('Nome visualizzato').fill('Senza consenso');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    // Il campo è `required`: un browser onesto blocca già l'invio. Il controllo server è per chi non lo è
    // (nessun JavaScript, richiesta diretta): si simula togliendo l'attributo prima di inviare.
    await page
      .locator('input[name="privacyAccepted"]')
      .evaluate((el) => el.removeAttribute('required'));
    await page.getByRole('button', { name: 'Crea account' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'informativa sulla privacy',
    );
  });

  test('esportazione dei dati personali e cancellazione dell’account', async ({ page }) => {
    await registerAndSignIn(page, 'Utente GDPR');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Esporta i miei dati (JSON)' }).click(),
    ]).then(([d]) => d);
    expect(await download.path()).toBeTruthy();

    // Chi possiede un mondo non può cancellare l'account.
    const worldId = await createWorld(page, 'Aurelia');
    await page.goto('/account');
    await page.getByLabel('Voglio eliminare il mio account').check();
    await page.getByRole('button', { name: "Elimina l'account" }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Possiedi ancora dei mondi',
    );

    // Elimina il mondo, poi la cancellazione dell'account riesce.
    await page.goto(`/worlds/${worldId}/settings`);
    await page.getByLabel(/Voglio eliminare/).check();
    await page.getByRole('button', { name: 'Elimina il mondo' }).click();
    await expect(page.getByRole('status')).toHaveText('Mondo eliminato.');

    await page.goto('/account');
    await page.getByLabel('Voglio eliminare il mio account').check();
    await page.getByRole('button', { name: "Elimina l'account" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('status')).toHaveText('Il tuo account è stato eliminato.');
  });
});
