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
  visibility: 'members' | 'secret',
  fields: Record<string, unknown> = {},
) => ({
  ref,
  title,
  status: 'final',
  visibility,
  archived: false,
  tags: [],
  aliases: [],
  categories: ['c1'],
  fields,
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  createdAt: '2026-01-01T10:00:00.000Z',
});

/** Elara (membri, con età e debolezza), Drago (segreto), Porto (membri); Elara «abita a» Porto. */
async function importWorld(page: Page): Promise<string> {
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Aurelia' },
    categories: [
      {
        ref: 'c1',
        name: 'Personaggio',
        icon: null,
        color: null,
        fieldsSchema: [
          { key: 'eta', label: 'Età', type: 'number' },
          { key: 'debolezza', label: 'Debolezza', type: 'text' },
        ],
        contentTemplate: null,
      },
    ],
    snippets: [
      snippet('s1', 'Elara', 'members', { eta: 30, debolezza: 'teme il fuoco' }),
      snippet('s2', 'Drago', 'secret', { eta: 900 }),
      snippet('s3', 'Porto', 'members'),
    ],
    relationTypes: [],
    relations: [
      {
        source: 's1',
        target: 's3',
        label: 'abita a',
        inverseLabel: 'ospita',
        notes: '',
        validFrom: null,
        validTo: null,
        fromMention: false,
        visibility: 'members',
        createdAt: '2026-02-01T10:00:00.000Z',
      },
    ],
  };
  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'aurelia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

async function openSnippet(page: Page, worldId: string, title: string) {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByRole('link', { name: title, exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

const panel = (page: Page) => page.locator('section[aria-labelledby="visibility"]');
/** Giocatori scelti per lo snippet (i campi hanno la loro lista, dentro il gruppo del campo). */
const snippetUsers = (page: Page) =>
  panel(page).getByRole('group', { name: 'Giocatori scelti', exact: true });
/** Livello di un campo: la select dentro il gruppo che ha il nome del campo. */
const fieldLevel = (page: Page, name: string) =>
  panel(page)
    .getByRole('group', { name: `Visibilità di ${name}`, exact: true })
    .getByLabel('Livello del campo');
const titlesInList = async (page: Page, worldId: string) => {
  await page.goto(`/worlds/${worldId}/snippets`);
  return page.locator('main a[href*="/snippets/"]').allInnerTexts();
};

test.describe('visibilità e rivelazioni', () => {
  test('il DM rivela uno snippet a un giocatore scelto: lo vede solo lui, ovunque e con registro', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const anna = await newUser(browser, 'Anna');
    const bruno = await newUser(browser, 'Bruno');
    const worldId = await importWorld(dm.page);
    await addMember(dm.page, worldId, anna.email, 'reader');
    await addMember(dm.page, worldId, bruno.email, 'reader');

    // Prima: il segreto non lo vede nessun giocatore, né in elenco, né nella ricerca, né in tabella.
    for (const p of [anna.page, bruno.page]) {
      expect(await titlesInList(p, worldId)).not.toContain('Drago');
      await p.goto(`/worlds/${worldId}/search?q=drago`);
      await expect(p.locator('main')).not.toContainText('Drago');
      await p.goto(`/worlds/${worldId}/table`);
      await expect(p.locator('main')).not.toContainText('Drago');
    }

    await openSnippet(dm.page, worldId, 'Drago');
    await panel(dm.page).getByLabel('Livello dello snippet').selectOption('shared');
    await snippetUsers(dm.page).getByLabel('Anna').check();
    await panel(dm.page).getByLabel(/^Nota/).fill('Rivelato nella sessione 3');
    await panel(dm.page).getByRole('button', { name: 'Applica visibilità' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Visibilità salvata.');
    await expect(panel(dm.page).getByLabel('Livello dello snippet')).toHaveValue('shared');
    await expect(snippetUsers(dm.page).getByLabel('Anna')).toBeChecked();
    // Il registro: chi, cosa, destinatari e nota, con l'indicazione di rivelazione.
    const log = dm.page.locator('ol.visibility-log li').first();
    await expect(log).toContainText('Rivelazione');
    await expect(log).toContainText('Solo DM (segreto)');
    await expect(log).toContainText('Giocatori scelti');
    await expect(log).toContainText('Anna');
    await expect(log).toContainText('Rivelato nella sessione 3');

    // Dopo: solo Anna lo vede, da ogni superficie; Bruno no.
    expect(await titlesInList(anna.page, worldId)).toContain('Drago');
    await anna.page.goto(`/worlds/${worldId}/search?q=drago`);
    await expect(anna.page.locator('main')).toContainText('Drago');
    await anna.page.goto(`/worlds/${worldId}/table`);
    await expect(anna.page.locator('main')).toContainText('Drago');
    expect(await titlesInList(bruno.page, worldId)).not.toContain('Drago');
    await bruno.page.goto(`/worlds/${worldId}/search?q=drago`);
    await expect(bruno.page.locator('main')).not.toContainText('Drago');
    const exportOf = async (page: Page) =>
      JSON.stringify(await (await page.request.get(`/worlds/${worldId}/export`)).json());
    expect(await exportOf(anna.page)).toContain('Drago');
    expect(await exportOf(bruno.page)).not.toContain('Drago');
    expect(await exportOf(bruno.page)).not.toContain('900');

    // Il giocatore non vede il pannello né il registro, e sul segreto Bruno riceve una pagina che non esiste.
    await openSnippet(anna.page, worldId, 'Drago');
    await expect(anna.page.locator('section[aria-labelledby="visibility"]')).toHaveCount(0);
    await expect(anna.page.locator('ol.visibility-log')).toHaveCount(0);
    const link = anna.page.url();
    expect((await bruno.page.goto(link))?.status()).toBe(404);

    // Togliere Anna dai destinatari lo nasconde subito.
    await dm.page.goto(dm.page.url().split('?')[0] as string);
    await panel(dm.page).getByLabel('Livello dello snippet').selectOption('secret');
    await panel(dm.page).getByRole('button', { name: 'Applica visibilità' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Visibilità salvata.');
    expect((await anna.page.goto(link))?.status()).toBe(404);
  });

  test('un campo segreto non arriva al giocatore da nessuna superficie, e il DM lo continua a modificare', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const anna = await newUser(browser, 'Anna');
    const worldId = await importWorld(dm.page);
    await addMember(dm.page, worldId, anna.email, 'reader');

    await openSnippet(dm.page, worldId, 'Elara');
    await fieldLevel(dm.page, 'Debolezza').selectOption('secret');
    await panel(dm.page).getByRole('button', { name: 'Applica visibilità' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Visibilità salvata.');
    await expect(dm.page.getByRole('status')).toHaveCount(1);

    // Il DM vede ancora il valore nel modulo e lo cambia: il nuovo valore va nel campo riservato.
    await expect(dm.page.getByLabel('Debolezza').first()).toHaveValue('teme il fuoco');
    await dm.page.getByLabel('Debolezza').first().fill('teme il salmastro');
    await dm.page.getByRole('button', { name: 'Salva', exact: true }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Snippet salvato.');
    await expect(dm.page.getByLabel('Debolezza').first()).toHaveValue('teme il salmastro');

    // Anna vede l'età ma non la debolezza: nella pagina, in tabella, nell'export.
    await openSnippet(anna.page, worldId, 'Elara');
    const fieldsSection = anna.page.locator('section[aria-labelledby="snippet-fields"]');
    await expect(fieldsSection).toContainText('Età');
    await expect(fieldsSection).toContainText('30');
    await expect(fieldsSection).not.toContainText('Debolezza');
    expect(await anna.page.content()).not.toContain('salmastro');
    expect(await anna.page.content()).not.toContain('fuoco');
    await anna.page.goto(`/worlds/${worldId}/table?cols=title,field:eta,field:debolezza`);
    await expect(anna.page.locator('main')).not.toContainText('salmastro');
    const annaFile = (await (await anna.page.request.get(`/worlds/${worldId}/export`)).json()) as {
      snippets: { title: string; fields: Record<string, unknown>; fieldVisibility?: object }[];
    };
    const annaText = JSON.stringify(annaFile);
    expect(annaText).not.toContain('salmastro');
    expect(annaText).not.toContain('fuoco');
    // Lo schema della categoria è pubblico (nome del campo), il valore no.
    const annaElara = annaFile.snippets.find((x) => x.title === 'Elara');
    expect(annaElara?.fields).toEqual({ eta: 30 });
    expect(annaElara).not.toHaveProperty('fieldVisibility');

    // Il DM invece vede il valore in tabella e nell'export, con la sua visibilità.
    await dm.page.goto(`/worlds/${worldId}/table?cols=title,field:eta,field:debolezza`);
    await expect(dm.page.locator('main')).toContainText('teme il salmastro');
    const dmExport = (await (await dm.page.request.get(`/worlds/${worldId}/export`)).json()) as {
      snippets: { title: string; fields: Record<string, unknown>; fieldVisibility?: object }[];
    };
    const elara = dmExport.snippets.find((s) => s.title === 'Elara');
    expect(elara?.fields.debolezza).toBe('teme il salmastro');
    expect(elara?.fieldVisibility).toEqual({ debolezza: 'secret' });

    // Rivelato a tutti i membri, il campo torna visibile ad Anna.
    await openSnippet(dm.page, worldId, 'Elara');
    await fieldLevel(dm.page, 'Debolezza').selectOption('members');
    await panel(dm.page).getByRole('button', { name: 'Applica visibilità' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Visibilità salvata.');
    await openSnippet(anna.page, worldId, 'Elara');
    await expect(anna.page.locator('section[aria-labelledby="snippet-fields"]')).toContainText(
      'teme il salmastro',
    );
  });

  test('una relazione segreta o condivisa si vede solo a chi spetta; accessibilità del pannello', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const anna = await newUser(browser, 'Anna');
    const bruno = await newUser(browser, 'Bruno');
    const worldId = await importWorld(dm.page);
    await addMember(dm.page, worldId, anna.email, 'reader');
    await addMember(dm.page, worldId, bruno.email, 'reader');

    await openSnippet(dm.page, worldId, 'Elara');
    const relation = dm.page.locator('ul.relations li').first();
    await relation
      .locator('details', { hasText: 'Visibilità: Tutti i membri' })
      .locator('summary')
      .click();
    await relation.getByLabel('Livello dello snippet').selectOption('shared');
    await relation.getByLabel('Bruno').check();
    await relation.getByRole('button', { name: 'Applica visibilità' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Visibilità salvata.');

    const relationTexts = async (page: Page) => {
      await openSnippet(page, worldId, 'Elara');
      return page.locator('ul.relations li').allInnerTexts();
    };
    expect((await relationTexts(bruno.page)).join(' ')).toContain('abita a');
    expect((await relationTexts(anna.page)).join(' ')).not.toContain('abita a');

    // Senza destinatari il modulo è rifiutato, e nulla cambia.
    await openSnippet(dm.page, worldId, 'Elara');
    await dm.page
      .locator('ul.relations li details', { hasText: 'Visibilità:' })
      .locator('summary')
      .click();
    await dm.page.locator('ul.relations li').first().getByLabel('Bruno').uncheck();
    await dm.page
      .locator('ul.relations li')
      .first()
      .getByRole('button', { name: 'Applica visibilità' })
      .click();
    await expect(dm.page.locator('p[role="alert"]')).toContainText('almeno un giocatore');
    expect((await relationTexts(bruno.page)).join(' ')).toContain('abita a');

    await openSnippet(dm.page, worldId, 'Elara');
    const serious = (await new AxeBuilder({ page: dm.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
