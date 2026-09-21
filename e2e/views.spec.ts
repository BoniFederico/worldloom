import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function createSnippet(page: Page, worldId: string, title: string) {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Cerca `q` e salva la ricerca come vista; restituisce l'URL stabile della vista. */
async function saveView(page: Page, worldId: string, q: string, name: string, shared: boolean) {
  await page.goto(`/worlds/${worldId}/search?q=${encodeURIComponent(q)}`);
  await page.getByText('Salva come vista').click();
  await page.getByLabel('Nome della vista').fill(name);
  const box = page.getByLabel('Condividi con i membri del mondo');
  if (shared) await box.check();
  else await box.uncheck();
  await page.getByRole('button', { name: 'Salva la vista' }).click();
  await expect(page.getByRole('status')).toHaveText('Vista salvata.');
  return page.url().split('?')[0] as string;
}

test.describe('viste salvate', () => {
  test('salva una ricerca come vista con link stabile, condivisa con i membri e non con gli estranei', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const stranger = await newUser(browser, 'Estraneo');
    const worldId = await createWorld(owner.page, 'Atlante');
    await addMember(owner.page, worldId, reader.email, 'reader');
    await createSnippet(owner.page, worldId, 'Elara la Saggia');
    await createSnippet(owner.page, worldId, 'Borin il Nano');

    const url = await saveView(owner.page, worldId, 'Elara', 'Le sagge', true);
    expect(url).toMatch(/\/worlds\/[0-9a-f-]{36}\/views\/[0-9a-f-]{36}$/);
    await expect(owner.page.getByRole('heading', { level: 1, name: 'Le sagge' })).toBeVisible();
    await expect(owner.page.getByRole('link', { name: 'Elara la Saggia' })).toBeVisible();
    await expect(owner.page.getByRole('link', { name: 'Borin il Nano' })).toHaveCount(0);

    // Persistenza: dopo un ricaricamento la vista c'è ancora, e compare nell'elenco.
    await owner.page.reload();
    await expect(owner.page.getByRole('link', { name: 'Elara la Saggia' })).toBeVisible();
    await owner.page.goto(`/worlds/${worldId}/views`);
    await expect(owner.page.getByRole('link', { name: 'Le sagge' })).toBeVisible();

    // Condivisibile: un membro apre lo stesso link e vede i risultati con i propri permessi.
    await reader.page.goto(url);
    await expect(reader.page.getByRole('heading', { level: 1, name: 'Le sagge' })).toBeVisible();
    await expect(reader.page.getByRole('link', { name: 'Elara la Saggia' })).toBeVisible();
    await expect(reader.page.getByRole('button', { name: 'Elimina la vista' })).toHaveCount(0);

    const denied = await stranger.page.goto(url);
    expect(denied?.status()).toBe(404);

    const serious = (await new AxeBuilder({ page: owner.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });

  test('una vista privata la vede solo chi l’ha creata; chi non scrive non può salvare', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const editor = await newUser(browser, 'Revisore');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await createWorld(owner.page, 'Privato');
    await addMember(owner.page, worldId, editor.email, 'editor');
    await addMember(owner.page, worldId, reader.email, 'reader');
    await createSnippet(owner.page, worldId, 'Elara');

    const url = await saveView(editor.page, worldId, 'Elara', 'Mio', false);
    await expect(editor.page.getByText('privata')).toBeVisible();
    expect((await owner.page.goto(url))?.status()).toBe(404);
    expect((await reader.page.goto(url))?.status()).toBe(404);

    await reader.page.goto(`/worlds/${worldId}/search?q=Elara`);
    await expect(reader.page.getByRole('link', { name: 'Elara' }).first()).toBeVisible();
    await expect(reader.page.getByText('Salva come vista')).toHaveCount(0);
  });

  test('rinomina, cambia la condivisione ed elimina con conferma', async ({ browser }) => {
    const owner = await newUser(browser, 'Autrice');
    const worldId = await createWorld(owner.page, 'Gestione');
    await createSnippet(owner.page, worldId, 'Elara');
    const url = await saveView(owner.page, worldId, 'Elara', 'Prima', true);

    await owner.page.getByLabel('Nome', { exact: true }).fill('Dopo');
    await owner.page.getByRole('button', { name: 'Salva', exact: true }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Vista aggiornata.');
    await expect(owner.page.getByRole('heading', { level: 1, name: 'Dopo' })).toBeVisible();

    await owner.page.getByRole('button', { name: 'Elimina la vista' }).click();
    await expect(owner.page.locator('.message-error')).toContainText('Spunta la conferma');
    await owner.page.getByLabel('Confermo l’eliminazione di questa vista').check();
    await owner.page.getByRole('button', { name: 'Elimina la vista' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Vista eliminata.');
    expect((await owner.page.goto(url))?.status()).toBe(404);
  });

  test('un nome vuoto viene rifiutato', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Vuoto');
    await createSnippet(page, worldId, 'Elara');
    await page.goto(`/worlds/${worldId}/search?q=Elara`);
    await page.getByText('Salva come vista').click();
    await page.getByLabel('Nome della vista').fill('   ');
    await page.getByRole('button', { name: 'Salva la vista' }).click();
    await expect(page.locator('.message-error')).toContainText(
      'Il nome della vista è obbligatorio',
    );
  });
});
