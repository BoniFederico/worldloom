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

const editor = (page: Page) => page.getByRole('textbox', { name: 'Testo' });

async function ready(page: Page) {
  await expect(page.getByRole('group', { name: 'Formattazione del testo' })).toBeVisible();
}

async function setup(browser: Browser) {
  const { page } = await newUser(browser, 'Autrice');
  const worldId = await createWorld(page, 'Menzioni');
  const elara = await createSnippet(page, worldId, 'Elara');
  await ready(page);
  await page.getByLabel('Alias').fill('La Dama Grigia');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByRole('status')).toHaveText('Snippet salvato.');
  const aurelia = await createSnippet(page, worldId, 'Aurelia');
  await ready(page);
  return { page, worldId, elara, aurelia };
}

async function mentionElara(page: Page, how: 'keyboard' | 'mouse' = 'keyboard') {
  await editor(page).click();
  await page.keyboard.type('Vedi @dam');
  const list = page.getByRole('listbox', { name: 'Snippet da menzionare' });
  await expect(list).toBeVisible();
  const option = list.getByRole('option', { name: /Elara/ });
  await expect(option).toContainText('alias: La Dama Grigia');
  if (how === 'keyboard') await page.keyboard.press('Enter');
  else await option.click();
  await expect(editor(page).locator('.mention')).toHaveText('@Elara');
  await expect(list).toHaveCount(0);
}

const saved = (page: Page) =>
  expect(page.locator('.save-status')).toHaveText('Salvato', { timeout: 10_000 });

test.describe('menzioni', () => {
  test('@ suggerisce per titolo e alias; la menzione crea il backlink', async ({ browser }) => {
    const { page, elara } = await setup(browser);
    await mentionElara(page);
    await saved(page);

    await page.goto(elara);
    const backlinks = page.getByRole('region', { name: 'Menzionato in' });
    await expect(backlinks.getByRole('link', { name: 'Aurelia' })).toBeVisible();
    // La menzione non compare tra le relazioni manuali (ha il suo pannello).
    await expect(page.locator('.relations li')).toHaveCount(0);
  });

  test('anche con il mouse; nessun risultato è comunicato', async ({ browser }) => {
    const { page } = await setup(browser);
    await mentionElara(page, 'mouse');

    await page.keyboard.type(' e @zzzz');
    await expect(page.locator('.mention-none')).toHaveText('Nessuno snippet corrisponde');
    await page.keyboard.press('Escape');
    await expect(page.locator('.mention-none')).toHaveCount(0);
  });

  test('togliendo la menzione sparisce il backlink', async ({ browser }) => {
    const { page, elara, aurelia } = await setup(browser);
    await mentionElara(page);
    await saved(page);
    await page.goto(elara);
    await expect(page.getByRole('region', { name: 'Menzionato in' }).getByRole('link')).toHaveCount(
      1,
    );

    await page.goto(aurelia);
    await ready(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Testo senza menzioni');
    await saved(page);

    await page.goto(elara);
    await expect(page.getByRole('region', { name: 'Menzionato in' }).getByRole('link')).toHaveCount(
      0,
    );
    await expect(page.getByText('Nessuno snippet cita questo snippet')).toBeVisible();
  });

  test('un lettore vede la menzione come link con il titolo aggiornato', async ({ browser }) => {
    const { page, worldId, elara, aurelia } = await setup(browser);
    await mentionElara(page);
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Snippet salvato.' })).toBeVisible();

    // Si rinomina lo snippet citato: la menzione mostra il titolo nuovo.
    await page.goto(elara);
    await ready(page);
    await page.getByLabel('Titolo').fill('Elara di Aurelia');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');

    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(aurelia);
    const link = reader.page.locator('.prose a.mention');
    await expect(link).toHaveText('@Elara di Aurelia');
    await link.click();
    await expect(
      reader.page.getByRole('heading', { level: 1, name: 'Elara di Aurelia' }),
    ).toBeVisible();
    await expect(
      reader.page
        .getByRole('region', { name: 'Menzionato in' })
        .getByRole('link', { name: 'Aurelia' }),
    ).toBeVisible();
  });

  test('uno snippet nel cestino non conta come backlink; una menzione a un cestinato non è un link', async ({
    browser,
  }) => {
    const { page, worldId, elara, aurelia } = await setup(browser);
    await mentionElara(page);
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Snippet salvato.' })).toBeVisible();

    // Il citante nel cestino sparisce dai backlink (e ritorna al ripristino).
    await page.getByRole('button', { name: 'Sposta nel cestino' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet spostato nel cestino.');
    await page.goto(elara);
    await expect(page.getByRole('region', { name: 'Menzionato in' }).getByRole('link')).toHaveCount(
      0,
    );
    await page.goto(aurelia);
    await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet ripristinato.');
    await page.goto(elara);
    await expect(page.getByRole('region', { name: 'Menzionato in' }).getByRole('link')).toHaveCount(
      1,
    );

    // Il citato nel cestino: per un lettore la menzione resta testo, senza link.
    await page.getByRole('button', { name: 'Sposta nel cestino' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet spostato nel cestino.');
    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(aurelia);
    // Nessun titolo dello snippet non leggibile: solo un segnaposto neutro.
    await expect(reader.page.locator('.prose .mention-missing')).toHaveText(
      '@snippet non disponibile',
    );
    await expect(reader.page.getByText('Elara', { exact: true })).toHaveCount(0);
    await expect(reader.page.locator('.prose a.mention')).toHaveCount(0);
  });

  test('duplicare uno snippet mantiene le sue menzioni tra i backlink', async ({ browser }) => {
    const { page, elara } = await setup(browser);
    await mentionElara(page);
    await saved(page);
    await page.getByRole('button', { name: 'Duplica' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Aurelia (copia)' })).toBeVisible();
    await ready(page);
    // Il titolo della menzione è risolto all'apertura, non salvato nel testo.
    await expect(editor(page).locator('.mention')).toHaveText('@Elara');

    await page.goto(elara);
    const links = page.getByRole('region', { name: 'Menzionato in' }).getByRole('link');
    await expect(links).toHaveText(['Aurelia', 'Aurelia (copia)']);
  });

  test('un id di menzione non valido inviato via API viene scartato dal server', async ({
    browser,
  }) => {
    const { page } = await setup(browser);
    await page.evaluate(() => {
      const input = document.querySelector('input[name="body_json"]') as HTMLInputElement;
      input.value = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'mention', attrs: { id: 'javascript:alert(1)', label: 'x' } }],
          },
        ],
      });
    });
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Snippet salvato.' })).toBeVisible();
    await expect(editor(page).locator('.mention')).toHaveCount(0);
  });

  test('accessibilità con i suggerimenti aperti', async ({ browser }) => {
    const { page } = await setup(browser);
    await editor(page).click();
    await page.keyboard.type('@e');
    await expect(page.getByRole('listbox', { name: 'Snippet da menzionare' })).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
