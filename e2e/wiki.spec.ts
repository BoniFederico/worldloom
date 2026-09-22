import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createWorld, registerAndSignIn } from './session';

async function createSnippet(page: Page, worldId: string, title: string): Promise<string> {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  return new URL(page.url()).pathname.split('/').pop() as string;
}

async function makePublic(page: Page, worldId: string, snippetId: string) {
  await page.goto(`/worlds/${worldId}/snippets/${snippetId}`);
  const panel = page.locator('section[aria-labelledby="visibility"]');
  await panel.getByLabel('Livello dello snippet').selectOption('public');
  await panel.getByRole('button', { name: 'Applica visibilità' }).click();
  await expect(panel.getByLabel('Livello dello snippet')).toHaveValue('public');
}

test.describe('wiki pubblica', () => {
  test('uno snippet pubblico è navigabile senza account; uno riservato resta 404', async ({
    browser,
  }) => {
    const owner = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(owner, 'Autrice');
    const worldId = await createWorld(owner, 'Aurelia');
    const publicId = await createSnippet(owner, worldId, 'Aragorn');
    const privateId = await createSnippet(owner, worldId, 'Segreto di famiglia');
    await makePublic(owner, worldId, publicId);

    // Prima della pubblicazione l'indice della wiki non esiste ancora.
    await owner.goto('/worlds/' + worldId + '/settings');
    await expect(owner.getByRole('heading', { name: 'Wiki pubblica' })).toBeVisible();
    await owner.getByLabel('Indirizzo (es. regno-di-aurelia)').fill('aurelia-e2e-test');
    await owner.getByRole('button', { name: 'Pubblica', exact: true }).click();
    await expect(owner.getByRole('status')).toHaveText('Wiki pubblicata.');

    const anon = await (await browser.newContext({ locale: 'it-IT' })).newPage();

    await anon.goto('/w/aurelia-e2e-test');
    await expect(anon.getByRole('heading', { level: 1, name: 'Aurelia' })).toBeVisible();
    await expect(anon.getByRole('link', { name: 'Aragorn' })).toBeVisible();
    await expect(anon.getByRole('link', { name: 'Segreto di famiglia' })).toHaveCount(0);

    await anon.getByRole('link', { name: 'Aragorn' }).click();
    await expect(anon.getByRole('heading', { level: 1, name: 'Aragorn' })).toBeVisible();
    const results = await new AxeBuilder({ page: anon }).analyze();
    expect(
      results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);

    // Lo snippet riservato non è raggiungibile dalla wiki, nemmeno conoscendone l'id diretto.
    const res = await anon.goto(`/w/aurelia-e2e-test/${privateId}`);
    expect(res?.status()).toBe(404);

    // Ritirando la wiki, l'indice torna 404 per un anonimo.
    await owner.goto(`/worlds/${worldId}/settings`);
    await owner.getByRole('button', { name: 'Ritira la wiki' }).click();
    await expect(owner.getByRole('status')).toHaveText('Wiki ritirata.');
    const afterUnpublish = await anon.goto('/w/aurelia-e2e-test');
    expect(afterUnpublish?.status()).toBe(404);
  });
});
