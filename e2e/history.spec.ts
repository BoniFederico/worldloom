import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

test.describe('cronologia versioni', () => {
  test('un altro autore modifica: confronto, ripristino e accesso solo per chi scrive', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const editor = await newUser(browser, 'Revisore');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await createWorld(owner.page, 'Storia');
    await addMember(owner.page, worldId, editor.email, 'editor');
    await addMember(owner.page, worldId, reader.email, 'reader');

    await owner.page.goto(`/worlds/${worldId}/snippets`);
    await owner.page.getByLabel('Titolo').fill('Elara');
    await owner.page.getByRole('button', { name: 'Crea snippet' }).click();
    await expect(owner.page.getByRole('heading', { level: 1, name: 'Elara' })).toBeVisible();
    const snippetUrl = owner.page.url().split('?')[0] as string;

    // Il revisore cambia titolo: nuova versione (autore diverso).
    await editor.page.goto(snippetUrl);
    await editor.page.getByLabel('Titolo').fill('Elara la Saggia');
    await editor.page.getByRole('button', { name: 'Salva' }).click();
    await expect(editor.page.getByRole('status')).toHaveText('Snippet salvato.');

    await owner.page.goto(`${snippetUrl}/history`);
    await expect(
      owner.page.getByRole('heading', { level: 1, name: 'Cronologia versioni' }),
    ).toBeVisible();
    await expect(owner.page.getByText('Versione 2').first()).toBeVisible();
    await expect(owner.page.locator('.diff-meta del')).toHaveText('Elara');
    await expect(owner.page.locator('.diff-meta ins')).toHaveText('Elara la Saggia');
    await expect(owner.page.getByText('Revisore').first()).toBeVisible();

    const serious = (await new AxeBuilder({ page: owner.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);

    // Ripristino della versione 1.
    await owner.page.getByRole('link', { name: /Versione 1/ }).click();
    await owner.page.getByRole('button', { name: 'Ripristina la versione 1' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Versione ripristinata.');
    await expect(
      owner.page.getByRole('heading', { level: 1, name: 'Elara', exact: true }),
    ).toBeVisible();

    await owner.page.goto(`${snippetUrl}/history`);
    await expect(owner.page.getByText('ripristino della versione 1')).toBeVisible();

    // Chi non può scrivere non vede né la pagina né il link.
    const denied = await reader.page.goto(`${snippetUrl}/history`);
    expect(denied?.status()).toBe(404);
    await reader.page.goto(snippetUrl);
    await expect(reader.page.getByRole('link', { name: 'Cronologia versioni' })).toHaveCount(0);
  });

  test('un token superato non sovrascrive: errore di conflitto', async ({ browser }) => {
    const owner = await newUser(browser, 'Autrice');
    const editor = await newUser(browser, 'Revisore');
    const worldId = await createWorld(owner.page, 'Conflitti');
    await addMember(owner.page, worldId, editor.email, 'editor');
    await owner.page.goto(`/worlds/${worldId}/snippets`);
    await owner.page.getByLabel('Titolo').fill('Elara');
    await owner.page.getByRole('button', { name: 'Crea snippet' }).click();
    await expect(owner.page.getByRole('heading', { level: 1, name: 'Elara' })).toBeVisible();
    const snippetUrl = owner.page.url().split('?')[0] as string;
    await editor.page.goto(snippetUrl);
    await editor.page.getByLabel('Titolo').fill('Elara B');
    await editor.page.getByRole('button', { name: 'Salva' }).click();
    await expect(editor.page.getByRole('status')).toHaveText('Snippet salvato.');

    await owner.page.goto(`${snippetUrl}/history?v=1`);
    // Nel frattempo qualcun altro modifica lo snippet.
    await editor.page.goto(snippetUrl);
    await editor.page.getByLabel('Titolo').fill('Elara C');
    await editor.page.getByRole('button', { name: 'Salva' }).click();
    await expect(editor.page.getByRole('status')).toHaveText('Snippet salvato.');
    await owner.page.getByRole('button', { name: 'Ripristina la versione 1' }).click();
    await expect(owner.page.locator('.message-error')).toContainText('modificato nel frattempo');
  });
});
