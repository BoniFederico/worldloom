import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

const snippet = (ref: string, title: string, visibility: 'members' | 'secret' = 'members') => ({
  ref,
  title,
  status: 'final',
  visibility,
  archived: false,
  tags: [],
  aliases: [],
  categories: [],
  fields: {},
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  createdAt: '2026-01-01T10:00:00.000Z',
});

const relation = (
  source: string,
  target: string,
  label: string,
  inverse: string | null,
  n: number,
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
  createdAt: `2026-02-0${n}T10:00:00.000Z`,
});

/**
 * Famiglia: Aldo è padre di Bea, Carlo, Segreto (segreto) ed Enzo (registrato al contrario: «Enzo figlio di Aldo»,
 * inversa «padre di»); Bea è padre di Dina e Gino; Carlo è padre di Gino (due genitori). Comando: Zeta → Eta → Teta → Zeta (ciclo).
 */
async function importWorld(page: Page): Promise<string> {
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Famiglia' },
    categories: [],
    snippets: [
      ...['Aldo', 'Bea', 'Carlo', 'Dina', 'Enzo', 'Gino', 'Zeta', 'Eta', 'Teta'].map((t, i) =>
        snippet(`s${i + 1}`, t),
      ),
      snippet('s10', 'Segreto', 'secret'),
    ],
    relationTypes: [],
    relations: [
      relation('s1', 's2', 'padre di', 'figlio di', 1),
      relation('s1', 's3', 'padre di', 'figlio di', 2),
      relation('s1', 's10', 'padre di', 'figlio di', 3),
      relation('s5', 's1', 'figlio di', 'padre di', 4),
      relation('s2', 's4', 'padre di', 'figlio di', 5),
      relation('s2', 's6', 'padre di', 'figlio di', 6),
      relation('s3', 's6', 'padre di', 'figlio di', 7),
      relation('s7', 's8', 'comanda', null, 8),
      relation('s8', 's9', 'comanda', null, 9),
      relation('s9', 's7', 'comanda', null, 1),
    ],
  };
  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'famiglia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

const names = (page: Page) => page.locator('ul.tree li > a').allInnerTexts();

test.describe('albero e gerarchia', () => {
  test('albero da un’etichetta, anche registrata al contrario; due genitori e antenati', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);

    await page.goto(`/worlds/${worldId}/tree?label=padre%20di`);
    await expect(page.getByRole('heading', { level: 1, name: 'Albero e gerarchia' })).toBeVisible();
    // Ordine del documento: Aldo, poi i figli per titolo, ognuno con i suoi discendenti.
    expect(await names(page)).toEqual([
      'Aldo',
      'Bea',
      'Dina',
      'Gino',
      'Carlo',
      'Gino',
      'Enzo',
      'Segreto',
    ]);
    // Gino ha due genitori: la seconda volta è un rimando e non si espande di nuovo.
    await expect(page.locator('ul.tree')).toContainText('già mostrato sopra');
    // La struttura è una lista annidata, quindi già testuale: Bea è dentro Aldo.
    await expect(page.locator('ul.tree > li > ul > li > a', { hasText: 'Bea' })).toBeVisible();

    // Etichetta senza badare alle maiuscole, e partenza da uno snippet.
    await page.goto(`/worlds/${worldId}/tree?label=PADRE%20DI&root=bea`);
    expect(await names(page)).toEqual(['Bea', 'Dina', 'Gino']);

    // Antenati di Dina.
    await page.goto(`/worlds/${worldId}/tree?label=padre%20di&root=Dina&dir=up`);
    expect(await names(page)).toEqual(['Dina', 'Bea', 'Aldo']);

    // Da tastiera: ogni nome è un link.
    await page.goto(`/worlds/${worldId}/tree?label=padre%20di`);
    await page.locator('ul.tree li > a', { hasText: 'Carlo' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Carlo' })).toBeVisible();
  });

  test('cicli e casi limite non rompono la pagina', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);

    await page.goto(`/worlds/${worldId}/tree?label=comanda`);
    await expect(page.getByText('formano un ciclo')).toBeVisible();
    expect(await names(page)).toEqual(['Eta', 'Teta', 'Zeta', 'Eta']);
    await expect(page.locator('ul.tree')).toContainText('ciclo: è già un antenato');

    await page.goto(`/worlds/${worldId}/tree?label=non-esiste`);
    await expect(page.getByText('Nessuna relazione con l’etichetta «non-esiste»')).toBeVisible();
    await page.goto(`/worlds/${worldId}/tree?label=padre%20di&root=Nessuno`);
    await expect(
      page.getByText('Nessuno snippet leggibile con il titolo «Nessuno».'),
    ).toBeVisible();
    await page.goto(`/worlds/${worldId}/tree`);
    await expect(page.getByText('Scegli un’etichetta per costruire l’albero.')).toBeVisible();
    const res = await page.goto(
      `/worlds/${worldId}/tree?label=${'a'.repeat(400)}%25&dir=boh&root=%5C_%25`,
    );
    expect(res?.status()).toBe(200);
  });

  test('permessi: il lettore non vede gli snippet segreti; vista salvata condivisa; accessibilità', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await importWorld(owner.page);
    await addMember(owner.page, worldId, reader.email, 'reader');

    await reader.page.goto(`/worlds/${worldId}/tree?label=padre%20di`);
    expect(await names(reader.page)).not.toContain('Segreto');
    expect(await reader.page.content()).not.toContain('Segreto');
    await expect(reader.page.getByText('Salva come vista')).toHaveCount(0);

    await owner.page.goto(`/worlds/${worldId}/tree?label=padre%20di`);
    expect(await names(owner.page)).toContain('Segreto');
    await owner.page.getByText('Salva come vista').click();
    await owner.page.getByLabel('Nome della vista').fill('Famiglia');
    await owner.page.getByRole('button', { name: 'Salva la vista' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Vista salvata.');
    const url = owner.page.url().split('?')[0] as string;
    expect(await names(owner.page)).toContain('Segreto');

    await reader.page.goto(url);
    await expect(reader.page.getByRole('heading', { level: 1, name: 'Famiglia' })).toBeVisible();
    expect(await names(reader.page)).toEqual([
      'Aldo',
      'Bea',
      'Dina',
      'Gino',
      'Carlo',
      'Gino',
      'Enzo',
    ]);

    await owner.page.goto(`/worlds/${worldId}/tree?label=padre%20di`);
    const serious = (await new AxeBuilder({ page: owner.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
