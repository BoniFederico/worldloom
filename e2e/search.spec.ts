import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function createSnippet(
  page: Page,
  worldId: string,
  title: string,
  extra: { tags?: string; alias?: string; category?: string } = {},
): Promise<string> {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  if (extra.category) await page.getByLabel('Categoria').selectOption({ label: extra.category });
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({
    timeout: 15_000,
  });
  const url = page.url().split('?')[0] as string;
  if (extra.tags || extra.alias) {
    if (extra.tags) await page.getByLabel('Tag', { exact: true }).fill(extra.tags);
    if (extra.alias) await page.getByLabel('Alias').fill(extra.alias);
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');
  }
  return url;
}

async function setup(browser: Browser) {
  const { page } = await newUser(browser, 'Autrice');
  const worldId = await createWorld(page, 'Ricerca');
  await page.goto(`/worlds/${worldId}/categories`);
  await page.getByLabel('Nome', { exact: true }).fill('Personaggio');
  await page.getByRole('button', { name: 'Crea categoria' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Personaggio' })).toBeVisible();
  const edaline = await createSnippet(page, worldId, 'Edaline', {
    tags: 'magia, nord',
    alias: 'La Strega Grigia',
    category: 'Personaggio',
  });
  await createSnippet(page, worldId, 'Città di Élan', { tags: 'nord' });
  await createSnippet(page, worldId, 'Balrog', { tags: 'fuoco' });
  return { page, worldId, edaline };
}

const palette = (page: Page) => page.getByRole('dialog', { name: 'Ricerca rapida' });
const paletteInput = (page: Page) => palette(page).getByRole('combobox');

test.describe('ricerca', () => {
  // Ogni test crea diversi snippet: con più worker in parallelo servono tempi più larghi.
  test.describe.configure({ timeout: 90_000 });

  test('Ctrl/Cmd+K apre la ricerca rapida: prefissi, alias e accenti; Invio apre lo snippet', async ({
    browser,
  }) => {
    const { page, worldId } = await setup(browser);
    await page.goto(`/worlds/${worldId}`);
    await page.keyboard.press('ControlOrMeta+K');
    await expect(palette(page)).toBeVisible();
    await expect(paletteInput(page)).toBeFocused();

    await paletteInput(page).fill('eda');
    const list = palette(page).getByRole('listbox', { name: 'Risultati' });
    await expect(list.getByRole('option').first()).toContainText('Edaline');

    // Alias e accenti.
    await paletteInput(page).fill('strega');
    await expect(list.getByRole('option').first()).toContainText('Edaline');
    await paletteInput(page).fill('citta elan');
    await expect(list.getByRole('option').first()).toContainText('Città di Élan');

    await paletteInput(page).fill('balr');
    await expect(list.getByRole('option').first()).toContainText('Balrog');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Balrog' })).toBeVisible();
    await expect(palette(page)).toBeHidden();
  });

  test('frecce, Esc e voce «ricerca completa»', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await page.goto(`/worlds/${worldId}`);
    await page.getByRole('button', { name: /^Cerca/ }).click();
    await paletteInput(page).fill('nord');
    const options = palette(page).getByRole('option');
    await expect(options).toHaveCount(3); // due risultati + ricerca completa
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); // torna in fondo: la voce di ricerca completa
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/worlds/${worldId}/search\\?q=nord`));
    await expect(page.getByRole('heading', { level: 1, name: 'Ricerca' })).toBeVisible();

    await page.keyboard.press('ControlOrMeta+K');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
  });

  test('pagina di ricerca: testo, filtri e termini evidenziati', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await page.goto(`/worlds/${worldId}/search`);
    await expect(page.getByText('Cerca per titolo, alias, tag e testo.')).toBeVisible();

    const form = page.getByRole('search', { name: 'Ricerca' });
    await form.getByLabel('Cerca', { exact: true }).fill('edal');
    await form.getByRole('button', { name: 'Cerca', exact: true }).click();
    await expect(page.getByText('1 risultato')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edaline' })).toBeVisible();

    // Filtri: tag (tutti), categoria, stato.
    await page.goto(`/worlds/${worldId}/search?tags=nord`);
    await expect(page.getByText('2 risultati')).toBeVisible();
    await page.goto(`/worlds/${worldId}/search?tags=nord%2C+magia`);
    await expect(page.getByText('1 risultato')).toBeVisible();

    await page.goto(`/worlds/${worldId}/search`);
    await form.getByText('Filtri', { exact: true }).click();
    await form.getByLabel('Categoria').selectOption({ label: 'Personaggio' });
    await form.getByRole('button', { name: 'Cerca', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Edaline' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Balrog' })).toHaveCount(0);

    await page.goto(`/worlds/${worldId}/search?status=final`);
    await expect(page.getByText('Nessun risultato')).toBeVisible();
    await expect(page.getByText('Nessuno snippet corrisponde alla ricerca.')).toBeVisible();
  });

  test('l’estratto evidenzia i termini e non interpreta HTML', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await createSnippet(page, worldId, 'Diario');
    await page.getByRole('textbox', { name: 'Testo' }).click();
    await page.keyboard.type('La <b>torre</b> è alta e la torre è antica');
    await expect(page.locator('.save-status')).toHaveText('Salvato', { timeout: 10_000 });

    await page.goto(`/worlds/${worldId}/search?q=torre`);
    const excerpt = page.locator('.search-excerpt').first();
    await expect(excerpt.locator('mark').first()).toHaveText('torre');
    // Il testo del corpo non diventa mai elementi HTML.
    await expect(excerpt.locator('b, img, script')).toHaveCount(0);
  });

  test('cestino e archiviati non compaiono, salvo richiesta', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await createSnippet(page, worldId, 'Mappa vecchia');
    await page.getByRole('button', { name: 'Archivia' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet archiviato.');
    await createSnippet(page, worldId, 'Mappa buttata');
    await page.getByRole('button', { name: 'Sposta nel cestino' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet spostato nel cestino.');

    await page.goto(`/worlds/${worldId}/search?q=mappa`);
    await expect(page.getByText('Nessun risultato')).toBeVisible();
    await page.goto(`/worlds/${worldId}/search?q=mappa&archived=1`);
    await expect(page.getByRole('link', { name: 'Mappa vecchia' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mappa buttata' })).toHaveCount(0);
  });

  test('parametri ripetuti o strani non rompono la pagina; un estraneo non vede il mondo', async ({
    browser,
  }) => {
    const { page, worldId } = await setup(browser);
    for (const query of [
      'q=a&q=b',
      'q=%27+or+1%3D1+--',
      'q=%26%7C%3A*()',
      'tags=a%7Bb',
      'field=Chiave+Non+Valida&value=x',
      'category=non-un-uuid',
    ]) {
      const response = await page.goto(`/worlds/${worldId}/search?${query}`);
      expect(response?.status()).toBe(200);
    }
    const stranger = await newUser(browser, 'Estraneo');
    const response = await stranger.page.goto(`/worlds/${worldId}/search?q=edaline`);
    expect(response?.status()).toBe(404);
  });

  test('un lettore cerca e trova gli snippet dei membri', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(`/worlds/${worldId}/search?q=balrog`);
    await expect(reader.page.getByRole('link', { name: 'Balrog' })).toBeVisible();
  });

  test('accessibilità della ricerca rapida e della pagina', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await page.goto(`/worlds/${worldId}/search?q=nord&tags=nord`);
    let result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);

    await page.keyboard.press('ControlOrMeta+K');
    await paletteInput(page).fill('nord');
    await expect(palette(page).getByRole('option').first()).toBeVisible();
    result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
