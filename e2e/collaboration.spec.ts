import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function createSnippet(page: Page, worldId: string, title: string): Promise<string> {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  return page.url().split('?')[0] as string;
}

test.describe('collaborazione in tempo reale su uno snippet', () => {
  test('presenza: chi altro guarda lo stesso snippet compare, e sparisce quando esce', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const anna = await newUser(browser, 'Anna');
    const worldId = await createWorld(dm.page, 'Aurelia');
    await addMember(dm.page, worldId, anna.email, 'reader');
    const url = await createSnippet(dm.page, worldId, 'Drago');

    // Da sola, la Direttrice non vede nessun altro.
    await expect(dm.page.locator('.presence-bar')).toHaveCount(0);

    await anna.page.goto(url);
    await expect(dm.page.locator('.presence-bar')).toContainText('Anna');
    await expect(anna.page.locator('.presence-bar')).toContainText('Direttrice');

    await anna.page.close();
    await expect(dm.page.locator('.presence-bar')).toHaveCount(0);
  });

  test('un lettore commenta; il commento arriva in tempo reale a chi guarda lo stesso snippet', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const anna = await newUser(browser, 'Anna');
    const worldId = await createWorld(dm.page, 'Aurelia');
    await addMember(dm.page, worldId, anna.email, 'reader');
    const url = await createSnippet(dm.page, worldId, 'Drago');
    await anna.page.goto(url);

    await anna.page.getByLabel('Nuovo commento').fill('Bella idea per il drago!');
    await anna.page.getByRole('button', { name: 'Commenta' }).click();
    await expect(anna.page.getByRole('status')).toHaveText('Commento pubblicato.');
    await expect(anna.page.getByText('Bella idea per il drago!')).toBeVisible();

    // Il DM non ricarica la pagina: il commento arriva da solo (Realtime).
    await expect(dm.page.getByText('Bella idea per il drago!')).toBeVisible({ timeout: 10_000 });
    await expect(dm.page.locator('.comments')).toContainText('Anna');
  });

  test('chi scrive nel mondo modera il commento di un lettore', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const anna = await newUser(browser, 'Anna');
    const worldId = await createWorld(dm.page, 'Aurelia');
    await addMember(dm.page, worldId, anna.email, 'reader');
    const url = await createSnippet(dm.page, worldId, 'Drago');

    await dm.page.getByLabel('Nuovo commento').fill('Nota del DM.');
    await dm.page.getByRole('button', { name: 'Commenta' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Commento pubblicato.');

    await anna.page.goto(url);
    await anna.page.getByLabel('Nuovo commento').fill('Commento della lettrice.');
    await anna.page.getByRole('button', { name: 'Commenta' }).click();
    await expect(anna.page.getByRole('status')).toHaveText('Commento pubblicato.');

    // Il DM può eliminare il commento della lettrice (moderazione) ma il proprio è anche suo per diritto d'autore.
    await dm.page.reload();
    await dm.page
      .locator('li', { hasText: 'Commento della lettrice.' })
      .getByRole('button', { name: 'Elimina' })
      .click();
    await expect(dm.page.getByRole('status')).toHaveText('Commento eliminato.');
    await expect(dm.page.getByText('Commento della lettrice.')).toHaveCount(0);
    await expect(dm.page.getByText('Nota del DM.')).toBeVisible();
  });

  test('accessibilità del pannello commenti', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const worldId = await createWorld(dm.page, 'Aurelia');
    await createSnippet(dm.page, worldId, 'Drago');
    const results = await new AxeBuilder({ page: dm.page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});
