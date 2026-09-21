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
  fields: Record<string, unknown>,
  opts: {
    categories?: string[];
    status?: 'draft' | 'final';
    visibility?: 'members' | 'secret';
  } = {},
) => ({
  ref,
  title,
  status: opts.status ?? 'final',
  visibility: opts.visibility ?? 'members',
  archived: false,
  tags: [],
  aliases: [],
  categories: opts.categories ?? ['c1'],
  fields,
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  createdAt: '2026-01-01T10:00:00.000Z',
});

/**
 * Trame (categoria con «Stato della trama»: Idea, In corso, Fatto): Alfa = Idea, Beta = In corso, Gamma senza valore,
 * Delta con un valore rimosso dalle opzioni, Segreto = Idea ma segreto. «Fuori» non è in nessuna categoria.
 * Note (categoria con una sintesi obbligatoria): «Senza sintesi» è una bozza incompleta.
 */
async function importWorld(page: Page): Promise<string> {
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Trame' },
    categories: [
      {
        ref: 'c1',
        name: 'Trama',
        icon: null,
        color: null,
        fieldsSchema: [
          {
            key: 'stato_trama',
            label: 'Stato della trama',
            type: 'choice',
            options: ['Idea', 'In corso', 'Fatto'],
          },
        ],
        contentTemplate: null,
      },
      {
        ref: 'c2',
        name: 'Nota',
        icon: null,
        color: null,
        fieldsSchema: [{ key: 'sintesi', label: 'Sintesi', type: 'text', required: true }],
        contentTemplate: null,
      },
    ],
    snippets: [
      snippet('s1', 'Alfa', { stato_trama: 'Idea' }),
      snippet('s2', 'Beta', { stato_trama: 'In corso' }),
      snippet('s3', 'Gamma', {}),
      snippet('s4', 'Delta', { stato_trama: 'Vecchio' }),
      snippet('s5', 'Segreto', { stato_trama: 'Idea' }, { visibility: 'secret' }),
      snippet('s6', 'Fuori', {}, { categories: [] }),
      snippet('s7', 'Senza sintesi', {}, { categories: ['c2'], status: 'draft' }),
    ],
    relationTypes: [],
    relations: [],
  };
  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'trame.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

const column = (page: Page, name: string) =>
  page.locator('section.kanban-column', { has: page.getByRole('heading', { name }) });
const cards = (page: Page, name: string) => column(page, name).locator('li.kanban-card > a');

/** Sposta una card con il suo modulo «Sposta in» (da tastiera basta scegliere e premere il pulsante). */
async function move(page: Page, title: string, to: string) {
  const form = page.locator('form[data-move]', { has: page.getByLabel(`Sposta «${title}» in`) });
  await form.getByLabel(`Sposta «${title}» in`).selectOption(to);
  await form.getByRole('button', { name: 'Sposta' }).click();
}

test.describe('bacheca kanban', () => {
  test('colonne dal campo a scelta, spostamento con il modulo e con il trascinamento', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);

    await page.goto(`/worlds/${worldId}/kanban`);
    await expect(page.getByRole('heading', { level: 1, name: 'Bacheca' })).toBeVisible();
    await expect(page.getByText('Scegli lo stato o un campo a scelta')).toBeVisible();

    await page.getByLabel('Colonne per').selectOption('stato_trama');
    await page.getByRole('button', { name: 'Mostra la bacheca' }).click();
    await expect(page.locator('section.kanban-column')).toHaveCount(5);
    expect(await cards(page, 'Senza valore').allInnerTexts()).toEqual(['Gamma']);
    expect(await cards(page, 'Idea').allInnerTexts()).toEqual(['Alfa', 'Segreto']);
    expect(await cards(page, 'In corso').allInnerTexts()).toEqual(['Beta']);
    expect(await cards(page, 'Fatto').allInnerTexts()).toEqual([]);
    // Lo snippet fuori dalla categoria e quello di un'altra categoria non entrano; il valore rimosso ha la sua colonna.
    expect(await cards(page, 'Vecchio').allInnerTexts()).toEqual(['Delta']);
    await expect(page.getByText('Fuori')).toHaveCount(0);

    // Da tastiera: il modulo «Sposta in» di ogni card.
    await move(page, 'Alfa', 'In corso');
    await expect(page.getByRole('status')).toHaveText('Card spostata.');
    expect(await cards(page, 'In corso').allInnerTexts()).toEqual(['Alfa', 'Beta']);
    expect(await cards(page, 'Idea').allInnerTexts()).toEqual(['Segreto']);

    // Il valore si può togliere.
    await move(page, 'Beta', '');
    await expect(cards(page, 'Senza valore')).toHaveText(['Beta', 'Gamma']);

    // Lo spostamento è una modifica dello snippet: lo si ritrova nel modulo.
    await page.goto(`/worlds/${worldId}/snippets`);
    await page.getByRole('link', { name: 'Alfa' }).first().click();
    await expect(page.getByLabel('Stato della trama')).toHaveValue('In corso');
  });

  test('trascinamento di una card in un’altra colonna', async ({ browser }, testInfo) => {
    // Sul telefono non c'è il trascinamento HTML5 (si usa il modulo) e le colonne stanno fuori schermo.
    test.skip(testInfo.project.name === 'mobile', 'trascinamento solo con il mouse');
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);
    await page.goto(`/worlds/${worldId}/kanban?by=stato_trama`);
    await column(page, 'Senza valore')
      .locator('li', { hasText: 'Gamma' })
      .getByRole('link', { name: 'Gamma' })
      .dragTo(column(page, 'Fatto'));
    await expect(cards(page, 'Fatto')).toHaveText(['Gamma'], { timeout: 15_000 });
    await expect(cards(page, 'Senza valore')).toHaveCount(0);

    // Lo spostamento è una modifica dello snippet: lo si ritrova nel modulo.
    await page.goto(`/worlds/${worldId}/snippets`);
    await page.getByRole('link', { name: 'Gamma' }).first().click();
    await expect(page.getByLabel('Stato della trama')).toHaveValue('Fatto');
  });

  test('bacheca per stato: il definitivo richiede i campi obbligatori; conflitto con una modifica altrui', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);

    await page.goto(`/worlds/${worldId}/kanban?by=status`);
    expect(await cards(page, 'Bozza').allInnerTexts()).toEqual(['Senza sintesi']);
    // Nello stato non si può togliere il valore: la destinazione «Senza valore» non c'è.
    await expect(
      page.getByLabel('Sposta «Senza sintesi» in').locator('option', { hasText: 'Senza valore' }),
    ).toHaveCount(0);

    await move(page, 'Senza sintesi', 'final');
    await expect(page.locator('p[role="alert"]')).toHaveText(/Mancano campi obbligatori/);
    expect(await cards(page, 'Bozza').allInnerTexts()).toEqual(['Senza sintesi']);

    // Una card mossa da un'altra scheda: la prima, con il dato vecchio, non sovrascrive.
    const other = await page.context().newPage();
    await other.goto(`/worlds/${worldId}/kanban?by=status`);
    await move(other, 'Alfa', 'draft');
    await expect(other.getByRole('status')).toHaveText('Card spostata.');

    await page.goto(`/worlds/${worldId}/kanban?by=stato_trama`);
    await other.goto(`/worlds/${worldId}/kanban?by=stato_trama`);
    await move(other, 'Beta', 'Fatto');
    await expect(other.getByRole('status')).toHaveText('Card spostata.');
    await move(page, 'Beta', 'Idea');
    await expect(page.locator('p[role="alert"]')).toHaveText(/modificato da qualcun altro/);
    expect(await cards(page, 'Fatto').allInnerTexts()).toEqual(['Beta']);
  });

  test('permessi: il lettore non sposta e non vede i segreti; vista salvata condivisa; accessibilità', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await importWorld(owner.page);
    await addMember(owner.page, worldId, reader.email, 'reader');

    await reader.page.goto(`/worlds/${worldId}/kanban?by=stato_trama`);
    expect(await cards(reader.page, 'Idea').allInnerTexts()).toEqual(['Alfa']);
    expect(await reader.page.content()).not.toContain('Segreto');
    await expect(reader.page.locator('form[data-move]')).toHaveCount(0);
    await expect(reader.page.getByText('Salva come vista')).toHaveCount(0);

    await owner.page.goto(`/worlds/${worldId}/kanban?by=stato_trama`);
    expect(await cards(owner.page, 'Idea').allInnerTexts()).toEqual(['Alfa', 'Segreto']);
    await owner.page.getByText('Salva come vista').click();
    await owner.page.getByLabel('Nome della vista').fill('Trame in corso');
    await owner.page.getByRole('button', { name: 'Salva la vista' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Vista salvata.');
    const url = owner.page.url().split('?')[0] as string;
    expect(await cards(owner.page, 'Idea').allInnerTexts()).toEqual(['Alfa', 'Segreto']);
    await expect(owner.page.locator('form[data-move]')).toHaveCount(0);

    await reader.page.goto(url);
    await expect(
      reader.page.getByRole('heading', { level: 1, name: 'Trame in corso' }),
    ).toBeVisible();
    expect(await cards(reader.page, 'Idea').allInnerTexts()).toEqual(['Alfa']);

    await owner.page.goto(`/worlds/${worldId}/kanban?by=stato_trama`);
    const serious = (await new AxeBuilder({ page: owner.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
