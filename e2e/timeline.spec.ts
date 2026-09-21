import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, registerAndSignIn } from './session';

const dateField = (key: string, label: string) => ({ key, label, type: 'calendar_date' });
const fields = [dateField('inizio', 'Inizio'), dateField('fine', 'Fine')];

const snippet = (
  ref: string,
  title: string,
  categories: string[],
  tags: string[],
  visibility: 'members' | 'secret' = 'members',
) => ({
  ref,
  title,
  status: 'final',
  visibility,
  archived: false,
  tags,
  aliases: [],
  categories,
  fields: {},
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  createdAt: '2026-01-01T10:00:00.000Z',
});

async function importWorld(page: Page): Promise<string> {
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Cronache' },
    categories: [
      {
        ref: 'c1',
        name: 'Eventi',
        icon: null,
        color: 'teal',
        fieldsSchema: fields,
        contentTemplate: null,
      },
      {
        ref: 'c2',
        name: 'Guerre',
        icon: null,
        color: 'rust',
        fieldsSchema: fields,
        contentTemplate: null,
      },
    ],
    snippets: [
      snippet('s1', 'Fondazione', ['c1'], ['storia']),
      snippet('s2', 'Incoronazione', ['c1'], ['corte']),
      snippet('s3', 'Grande Guerra', ['c2'], ['storia']),
      snippet('s4', 'Complotto', ['c1'], [], 'secret'),
    ],
    relationTypes: [],
    relations: [
      {
        source: 's3',
        target: 's2',
        label: 'causa di',
        inverseLabel: null,
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
    name: 'cronache.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

async function createCalendar(page: Page, worldId: string) {
  await page.goto(`/worlds/${worldId}/calendars`);
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crea calendario' }) });
  await form.getByLabel('Nome', { exact: true }).fill('Calendario di Aurelia');
  await form.getByLabel('Mesi', { exact: true }).fill('Alba, 30\nSole, 30\nMesse, 30\nBruma, 30');
  await form.getByLabel('Ere (facoltative)').fill('Era Nuova, 100');
  await form.getByRole('button', { name: 'Crea calendario' }).click();
  await expect(page.getByRole('status')).toHaveText('Calendario creato.');
}

/** Imposta le date di uno snippet dal suo modulo: [gruppo, anno nell'era, mese, giorno]. */
async function setDates(
  page: Page,
  worldId: string,
  title: string,
  dates: [string, string, string, string][],
) {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByRole('link', { name: title, exact: true }).click();
  for (const [group, year, month, day] of dates) {
    const g = page.getByRole('group', { name: group });
    await g.getByLabel('Era').selectOption('Era Nuova');
    await g.getByLabel('Anno').fill(year);
    await g.getByLabel('Mese').selectOption({ label: month });
    await g.getByLabel('Giorno').fill(day);
  }
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  await page.waitForURL(/notice=saved/);
}

const eventNames = (page: Page) =>
  page
    .locator('svg.timeline a.timeline-event text')
    .evaluateAll((els) => els.map((el) => el.textContent ?? ''))
    .then((t) => t.sort());

test.describe.configure({ mode: 'serial' });

test.describe('timeline', () => {
  let owner: Page;
  let reader: Page;
  let worldId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240_000);
    owner = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(owner, 'Autrice');
    reader = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    const readerEmail = await registerAndSignIn(reader, 'Lettore');
    worldId = await importWorld(owner);
    await addMember(owner, worldId, readerEmail, 'reader');
    await createCalendar(owner, worldId);
    await setDates(owner, worldId, 'Fondazione', [['Inizio', '1', 'Alba', '1']]);
    await setDates(owner, worldId, 'Incoronazione', [['Inizio', '50', 'Sole', '10']]);
    await setDates(owner, worldId, 'Grande Guerra', [
      ['Inizio', '20', 'Messe', '1'],
      ['Fine', '30', 'Bruma', '30'],
    ]);
    await setDates(owner, worldId, 'Complotto', [['Inizio', '49', 'Alba', '5']]);
  });

  test('corsie per categoria, eventi puntuali e a intervallo, alternativa testuale ordinata', async () => {
    await owner.goto(`/worlds/${worldId}/timeline`);
    await expect(owner.getByRole('heading', { level: 1, name: 'Timeline' })).toBeVisible();
    // Senza campo di fine scelto gli eventi sono tutti puntuali.
    expect(await eventNames(owner)).toEqual([
      'Complotto',
      'Fondazione',
      'Grande Guerra',
      'Incoronazione',
    ]);
    await expect(owner.locator('svg.timeline .timeline-lane-label')).toHaveText([
      'Eventi',
      'Guerre',
    ]);

    await owner.goto(`/worlds/${worldId}/timeline?end=fine`);
    await expect(owner.locator('svg.timeline a.timeline-event rect')).toHaveCount(1);
    await expect(owner.locator('svg.timeline a.timeline-event circle')).toHaveCount(3);

    // Tabella cronologica: ordine per data, non per titolo, con le date nel calendario.
    const rows = await owner.locator('.data-table tbody tr th').allInnerTexts();
    expect(rows).toEqual(['Fondazione', 'Grande Guerra', 'Complotto', 'Incoronazione']);
    await expect(owner.locator('.data-table tbody tr').first()).toContainText('1 Alba 1 Era Nuova');
  });

  test('zoom e spostamento con link, filtri per categoria, tag e collegamento', async () => {
    await owner.goto(`/worlds/${worldId}/timeline`);
    await owner.getByRole('link', { name: 'Ingrandisci' }).click();
    await owner.waitForURL(/zoom=1/);
    await owner.getByRole('link', { name: 'Ingrandisci' }).click();
    await owner.waitForURL(/zoom=2/);
    await expect(owner.getByRole('link', { name: 'Indietro nel tempo' })).toBeVisible();
    await owner.getByRole('link', { name: 'Mostra tutto' }).click();
    await owner.waitForURL((u) => !u.search.includes('zoom'));

    // Zoom molto stretto attorno a un evento: gli altri restano fuori, contati, ma nella tabella.
    await owner.goto(`/worlds/${worldId}/timeline?zoom=8&center=12000`);
    await expect(owner.getByText(/sono fuori dalla finestra|è fuori dalla finestra/)).toBeVisible();
    expect(await owner.locator('.data-table tbody tr').count()).toBe(4);

    await owner.goto(`/worlds/${worldId}/timeline?tag=storia`);
    expect(await eventNames(owner)).toEqual(['Fondazione', 'Grande Guerra']);
    await owner.goto(`/worlds/${worldId}/timeline?lane=tag`);
    await expect(owner.locator('svg.timeline .timeline-lane-label')).toHaveText([
      'corte',
      'storia',
      'Senza tag',
    ]);

    await owner.goto(`/worlds/${worldId}/timeline`);
    await owner.getByLabel('Categoria').selectOption({ label: 'Guerre' });
    await owner.getByRole('button', { name: 'Applica' }).click();
    await owner.waitForURL(/category=/);
    expect(await eventNames(owner)).toEqual(['Grande Guerra']);

    await owner.goto(`/worlds/${worldId}/timeline?related=grande%20guerra`);
    expect(await eventNames(owner)).toEqual(['Grande Guerra', 'Incoronazione']);
    await owner.goto(`/worlds/${worldId}/timeline?related=Nessuno`);
    await expect(
      owner.getByText('Nessuno snippet leggibile con il titolo «Nessuno».'),
    ).toBeVisible();

    // Da tastiera: l'evento è un link.
    await owner.goto(`/worlds/${worldId}/timeline`);
    await owner.locator('svg.timeline a.timeline-event', { hasText: 'Fondazione' }).focus();
    await owner.keyboard.press('Enter');
    await expect(owner.getByRole('heading', { level: 1, name: 'Fondazione' })).toBeVisible();
  });

  test('permessi: gli snippet segreti non compaiono al lettore; vista salvata condivisa', async () => {
    await reader.goto(`/worlds/${worldId}/timeline`);
    expect(await eventNames(reader)).toEqual(['Fondazione', 'Grande Guerra', 'Incoronazione']);
    expect(await reader.content()).not.toContain('Complotto');
    await expect(reader.getByText('Salva come vista')).toHaveCount(0);

    await owner.goto(`/worlds/${worldId}/timeline?end=fine&lane=tag`);
    await owner.getByText('Salva come vista').click();
    await owner.getByLabel('Nome della vista').fill('Cronologia');
    await owner.getByRole('button', { name: 'Salva la vista' }).click();
    await expect(owner.getByRole('status')).toHaveText('Vista salvata.');
    const url = owner.url().split('?')[0] as string;
    expect(await eventNames(owner)).toContain('Complotto');

    await reader.goto(url);
    await expect(reader.getByRole('heading', { level: 1, name: 'Cronologia' })).toBeVisible();
    expect(await eventNames(reader)).toEqual(['Fondazione', 'Grande Guerra', 'Incoronazione']);
  });

  test('accessibilità e parametri ostili', async () => {
    await owner.goto(`/worlds/${worldId}/timeline?end=fine`);
    await expect(owner.locator('svg.timeline')).toBeVisible();
    const serious = (await new AxeBuilder({ page: owner }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);

    const res = await owner.goto(
      `/worlds/${worldId}/timeline?calendar=xx&start=%27%3B--&zoom=99&center=1e99&lane=boh&related=${'a'.repeat(400)}`,
    );
    expect(res?.status()).toBe(200);
    await expect(owner.getByRole('heading', { level: 1, name: 'Timeline' })).toBeVisible();
  });
});
