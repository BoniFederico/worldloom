import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

const snippet = (
  ref: string,
  title: string,
  eta: number | null,
  status: 'draft' | 'final',
  categories: string[],
  tags: string[],
  createdAt: string,
) => ({
  ref,
  title,
  status,
  visibility: 'members',
  archived: false,
  tags,
  aliases: [],
  categories,
  fields: eta === null ? {} : { eta },
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  createdAt,
});

/** Importa un mondo di prova (più veloce che crearlo a mano) e restituisce il suo id. */
async function importWorld(page: Page): Promise<string> {
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Tabella' },
    categories: [
      {
        ref: 'c1',
        name: 'Luogo',
        icon: null,
        color: null,
        fieldsSchema: [],
        contentTemplate: null,
      },
      {
        ref: 'c2',
        name: 'Personaggio',
        icon: null,
        color: null,
        fieldsSchema: [{ key: 'eta', label: 'Età', type: 'number' }],
        contentTemplate: null,
      },
    ],
    snippets: [
      snippet('s1', 'Borin', 100, 'final', ['c2'], ['nano'], '2026-01-01T10:00:00.000Z'),
      snippet('s2', 'Aldera', 9, 'draft', ['c2'], ['elfo', 'nord'], '2026-01-02T10:00:00.000Z'),
      snippet('s3', 'Cael', 20, 'final', ['c2'], ['elfo'], '2026-01-03T10:00:00.000Z'),
      snippet('s4', 'Porto Verde', null, 'draft', ['c1'], [], '2026-01-04T10:00:00.000Z'),
    ],
    relationTypes: [],
    relations: [],
  };
  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'tabella.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

/** Titoli delle righe nell'ordine mostrato (la prima colonna è l'intestazione di riga). */
const titles = (page: Page) =>
  page.locator('tbody tr:not(.data-group) th[scope="row"]').allInnerTexts();

test.describe('vista tabella', () => {
  test('colonne dai campi, ordinamento numerico, raggruppamento e filtri', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);

    await page.goto(
      `/worlds/${worldId}/table?cols=title&cols=status&cols=field:eta&sort=title&dir=asc`,
    );
    await expect(page.getByRole('columnheader', { name: /Età/ })).toBeVisible();
    expect(await titles(page)).toEqual(['Aldera', 'Borin', 'Cael', 'Porto Verde']);

    // Ordinare per un campo numerico: 9 < 20 < 100 (non «100» < «20» come testo); i vuoti in fondo.
    await page.getByRole('columnheader', { name: /Età/ }).getByRole('link').click();
    await expect(page.getByRole('columnheader', { name: /Età/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(await titles(page)).toEqual(['Aldera', 'Cael', 'Borin', 'Porto Verde']);
    await page.getByRole('columnheader', { name: /Età/ }).getByRole('link').click();
    await expect(page.getByRole('columnheader', { name: /Età/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(await titles(page)).toEqual(['Borin', 'Cael', 'Aldera', 'Porto Verde']);

    // Raggruppamento per stato.
    await page.goto(`/worlds/${worldId}/table?cols=title&cols=status&group=status`);
    await expect(page.locator('.data-group th').nth(0)).toContainText('Bozza (2)');
    await expect(page.locator('.data-group th').nth(1)).toContainText('Definitivo (2)');

    // Filtri: categoria e tag.
    await page.goto(`/worlds/${worldId}/table`);
    await page.getByLabel('Categoria').selectOption({ label: 'Luogo' });
    await page.getByRole('button', { name: 'Applica' }).click();
    await page.waitForURL(/category=/);
    expect(await titles(page)).toEqual(['Porto Verde']);
    await page.goto(`/worlds/${worldId}/table?tags=elfo&status=final`);
    expect(await titles(page)).toEqual(['Cael']);
    await page.goto(`/worlds/${worldId}/table?field=eta&value=9`);
    expect(await titles(page)).toEqual(['Aldera']);
  });

  test('salva la tabella come vista condivisa e la apre un altro membro; ordinamento da tastiera', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await importWorld(owner.page);
    await addMember(owner.page, worldId, reader.email, 'reader');

    await owner.page.goto(
      `/worlds/${worldId}/table?cols=title&cols=field:eta&sort=field:eta&dir=desc&tags=elfo`,
    );
    await owner.page.getByText('Salva come vista').click();
    await owner.page.getByLabel('Nome della vista').fill('Elfi per età');
    await owner.page.getByRole('button', { name: 'Salva la vista' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Vista salvata.');
    const url = owner.page.url().split('?')[0] as string;
    expect(await titles(owner.page)).toEqual(['Cael', 'Aldera']);

    await reader.page.goto(url);
    await expect(
      reader.page.getByRole('heading', { level: 1, name: 'Elfi per età' }),
    ).toBeVisible();
    expect(await titles(reader.page)).toEqual(['Cael', 'Aldera']);

    // Tastiera: portare il fuoco sull'intestazione «Titolo» e premere Invio ordina la tabella.
    await reader.page
      .getByRole('columnheader', { name: /Titolo/ })
      .getByRole('link')
      .focus();
    await reader.page.keyboard.press('Enter');
    await expect(reader.page.getByRole('columnheader', { name: /Titolo/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(await titles(reader.page)).toEqual(['Aldera', 'Cael']);

    const serious = (await new AxeBuilder({ page: reader.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });

  test('accessibilità della pagina della tabella', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);
    await page.goto(
      `/worlds/${worldId}/table?cols=title&cols=status&cols=field:eta&group=category`,
    );
    await expect(page.getByRole('table')).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
