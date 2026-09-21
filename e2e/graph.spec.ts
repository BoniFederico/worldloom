import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

const snippet = (
  ref: string,
  title: string,
  categories: string[],
  visibility: 'members' | 'secret',
  createdAt: string,
) => ({
  ref,
  title,
  status: 'final',
  visibility,
  archived: false,
  tags: [],
  aliases: [],
  categories,
  fields: {},
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  createdAt,
});

const relation = (
  source: string,
  target: string,
  label: string,
  inverse: string | null,
  createdAt: string,
) => ({
  source,
  target,
  label,
  inverseLabel: inverse,
  notes: '',
  validFrom: null,
  validTo: null,
  fromMention: false,
  visibility: 'members',
  createdAt,
});

/** Catena Aldera – Borin – Cael – Dorna (+ Segreto legato a Cael, visibile solo a chi scrive). */
async function importWorld(page: Page): Promise<string> {
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Grafo' },
    categories: [
      {
        ref: 'c1',
        name: 'Persone',
        icon: null,
        color: 'teal',
        fieldsSchema: [],
        contentTemplate: null,
      },
      {
        ref: 'c2',
        name: 'Luoghi',
        icon: null,
        color: 'moss',
        fieldsSchema: [],
        contentTemplate: null,
      },
    ],
    snippets: [
      snippet('s1', 'Aldera', ['c1'], 'members', '2026-01-01T10:00:00.000Z'),
      snippet('s2', 'Borin', ['c1'], 'members', '2026-01-02T10:00:00.000Z'),
      snippet('s3', 'Cael', ['c2'], 'members', '2026-01-03T10:00:00.000Z'),
      snippet('s4', 'Dorna', ['c2'], 'members', '2026-01-04T10:00:00.000Z'),
      snippet('s5', 'Segreto', ['c1'], 'secret', '2026-01-05T10:00:00.000Z'),
    ],
    relationTypes: [],
    relations: [
      relation('s1', 's2', 'alleato di', 'alleato di', '2026-02-01T10:00:00.000Z'),
      relation('s2', 's3', 'vive a', 'ospita', '2026-02-02T10:00:00.000Z'),
      relation('s3', 's4', 'vicino a', 'vicino a', '2026-02-03T10:00:00.000Z'),
      relation('s5', 's3', 'conosce', null, '2026-02-04T10:00:00.000Z'),
    ],
  };
  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'grafo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

const nodeNames = (page: Page) =>
  page
    .locator('svg.graph a.graph-node text')
    .evaluateAll((els) => els.map((el) => el.textContent ?? ''))
    .then((t) => t.sort());
const tableRows = (page: Page) => page.locator('.data-table tbody tr').allInnerTexts();

test.describe('vista grafo', () => {
  test('disegno con nodi cliccabili, profondità dal nodo scelto e alternativa in tabella', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);

    await page.goto(`/worlds/${worldId}/graph`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Grafo delle relazioni' }),
    ).toBeVisible();
    expect(await nodeNames(page)).toEqual(['Aldera', 'Borin', 'Cael', 'Dorna', 'Segreto']);
    // Alternativa accessibile: le stesse relazioni in una tabella, con link agli snippet.
    const rows = await tableRows(page);
    expect(rows).toHaveLength(4);
    expect(rows.join('\n')).toContain('vive a');
    await expect(
      page.getByRole('table').getByRole('link', { name: 'Borin' }).first(),
    ).toBeVisible();

    // Clic su un nodo: il grafo si centra e la profondità limita i nodi (1 passo da Aldera = Aldera + Borin).
    await page.locator('svg.graph a.graph-node', { hasText: 'Aldera' }).click();
    await expect(page.getByText('Grafo centrato su «Aldera».')).toBeVisible();
    await page.getByLabel('Profondità dal nodo scelto').selectOption('1');
    await page.getByRole('button', { name: 'Applica' }).click();
    await page.waitForURL(/depth=1/);
    expect(await nodeNames(page)).toEqual(['Aldera', 'Borin']);
    await page.goto(`${page.url().replace('depth=1', 'depth=3')}`);
    expect(await nodeNames(page)).toEqual(['Aldera', 'Borin', 'Cael', 'Dorna', 'Segreto']);
  });

  test('filtri per categoria ed etichetta, e da tastiera', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);

    await page.goto(`/worlds/${worldId}/graph?label=vive%20a`);
    expect(await nodeNames(page)).toEqual(['Borin', 'Cael']);
    // Anche l'etichetta inversa trova la relazione.
    await page.goto(`/worlds/${worldId}/graph?label=ospita`);
    expect(await nodeNames(page)).toEqual(['Borin', 'Cael']);

    await page.goto(`/worlds/${worldId}/graph`);
    await page.getByLabel('Categoria').selectOption({ label: 'Luoghi' });
    await page.getByRole('button', { name: 'Applica' }).click();
    await page.waitForURL(/category=/);
    expect(await nodeNames(page)).toEqual(['Cael', 'Dorna']);

    // Tastiera: il nodo è un link raggiungibile con Tab; Invio centra il grafo.
    await page.goto(`/worlds/${worldId}/graph`);
    await page.locator('svg.graph a.graph-node', { hasText: 'Dorna' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Grafo centrato su «Dorna».')).toBeVisible();
  });

  test('permessi: chi non può leggere uno snippet non lo vede né nel disegno né nella tabella; vista salvata condivisa', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await importWorld(owner.page);
    await addMember(owner.page, worldId, reader.email, 'reader');

    await reader.page.goto(`/worlds/${worldId}/graph`);
    expect(await nodeNames(reader.page)).toEqual(['Aldera', 'Borin', 'Cael', 'Dorna']);
    expect(await reader.page.content()).not.toContain('Segreto');
    expect(await tableRows(reader.page)).toHaveLength(3);
    await expect(reader.page.getByText('Salva come vista')).toHaveCount(0);

    await owner.page.goto(`/worlds/${worldId}/graph?depth=1`);
    await owner.page.getByText('Salva come vista').click();
    await owner.page.getByLabel('Nome della vista').fill('Il mondo');
    await owner.page.getByRole('button', { name: 'Salva la vista' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Vista salvata.');
    const url = owner.page.url().split('?')[0] as string;
    expect(await nodeNames(owner.page)).toContain('Segreto');

    await reader.page.goto(url);
    await expect(reader.page.getByRole('heading', { level: 1, name: 'Il mondo' })).toBeVisible();
    expect(await nodeNames(reader.page)).toEqual(['Aldera', 'Borin', 'Cael', 'Dorna']);
  });

  test('accessibilità del grafo', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);
    await page.goto(`/worlds/${worldId}/graph`);
    await expect(page.locator('svg.graph')).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });

  test('parametri ostili non rompono la pagina', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);
    const res = await page.goto(
      `/worlds/${worldId}/graph?center=xx&depth=99&category=zz&label=${'a'.repeat(400)}&mentions=boh&depth=1`,
    );
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Grafo delle relazioni' }),
    ).toBeVisible();
  });
});
