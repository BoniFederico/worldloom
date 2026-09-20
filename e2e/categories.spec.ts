import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string, locale = 'it-IT') {
  const page = await (await browser.newContext({ locale })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

test.describe('categorie', () => {
  test('creazione, modifica ed eliminazione', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Aurelia');
    await page.goto(`/worlds/${worldId}/categories`);
    await expect(page.getByText('Nessuna categoria')).toBeVisible();

    await page.getByLabel('Nome', { exact: true }).fill('Bestia');
    await page.getByLabel('Icona').selectOption('skull');
    await page.getByLabel('Rosa').check();
    await page.getByRole('button', { name: 'Crea categoria' }).click();
    await expect(page.getByRole('status')).toHaveText('Categoria creata.');
    await expect(page.getByRole('heading', { level: 1, name: 'Bestia' })).toBeVisible();
    await expect(page.getByText('Questa categoria non ha ancora campi.')).toBeVisible();

    await page.getByLabel('Nome', { exact: true }).fill('Creatura');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Creatura' })).toBeVisible();

    await page.getByRole('button', { name: 'Elimina la categoria' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Spunta la conferma');
    await page.getByLabel('Voglio eliminare «Creatura»').check();
    await page.getByRole('button', { name: 'Elimina la categoria' }).click();
    await expect(page.getByRole('status')).toHaveText('Categoria eliminata.');
    await expect(page.getByText('Nessuna categoria')).toBeVisible();
  });

  test('un nome vuoto viene rifiutato', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Vuoto');
    await page.goto(`/worlds/${worldId}/categories`);
    await page.getByLabel('Nome', { exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Crea categoria' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Controlla nome');
  });

  test('importa i preset nella lingua dell’utente, con campi e opzioni', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Preset');
    await page.goto(`/worlds/${worldId}/categories`);
    await page.getByRole('button', { name: 'Importa i selezionati' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('almeno un preset');

    await page.getByLabel('Personaggio').check();
    await page.getByLabel('Luogo').check();
    await page.getByRole('button', { name: 'Importa i selezionati' }).click();
    await expect(page.getByRole('status')).toHaveText('Preset importati.');
    await page.getByRole('link', { name: /Personaggio/ }).click();
    await expect(page.getByText('Scelta: Vivo, Morto, Disperso, Sconosciuto')).toBeVisible();
    await expect(page.getByText('Data in calendario').first()).toBeVisible();
  });

  test('i preset in inglese hanno etichette inglesi', async ({ browser }) => {
    const { page } = await newUser(browser, 'Author');
    await page.getByRole('button', { name: 'EN' }).click();
    const worldId = await createWorld(page, 'English');
    await page.goto(`/worlds/${worldId}/categories`);
    await page.getByLabel('Faction').check();
    await page.getByRole('button', { name: 'Import selected' }).click();
    await expect(page.getByRole('link', { name: /Faction/ })).toBeVisible();
  });

  test('un lettore vede le categorie ma non può modificarle', async ({ browser }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await createWorld(owner.page, 'Sola lettura');
    await owner.page.goto(`/worlds/${worldId}/categories`);
    await owner.page.getByLabel('Regola').check();
    await owner.page.getByRole('button', { name: 'Importa i selezionati' }).click();
    await addMember(owner.page, worldId, reader.email, 'reader');

    await reader.page.goto(`/worlds/${worldId}/categories`);
    await expect(reader.page.getByRole('link', { name: /Regola/ })).toBeVisible();
    await expect(reader.page.getByRole('button', { name: 'Crea categoria' })).toBeHidden();
    await expect(
      reader.page.getByText('Puoi vedere le categorie ma non modificarle.'),
    ).toBeVisible();
  });

  test('un estraneo non accede alle categorie di un altro mondo', async ({ browser }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const outsider = await newUser(browser, 'Estraneo');
    const worldId = await createWorld(owner.page, 'Privato');
    const res = await outsider.page.goto(`/worlds/${worldId}/categories`);
    expect(res?.status()).toBe(404);
  });

  test('accessibilità di elenco e dettaglio', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Accessibile');
    await page.goto(`/worlds/${worldId}/categories`);
    await page.getByLabel('Personaggio').check();
    await page.getByRole('button', { name: 'Importa i selezionati' }).click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/worlds/${worldId}/categories`);
      let r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
        [],
      );
      await page.getByRole('link', { name: /Personaggio/ }).click();
      r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
        [],
      );
    }
  });
});
