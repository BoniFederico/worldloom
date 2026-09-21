import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { makePng } from './png';
import { addMember, registerAndSignIn } from './session';

// Mappa di prova 800×500: la forma non quadrata verifica che i pin seguano l'immagine.
const PNG = makePng(800, 500);

const snippet = (
  ref: string,
  title: string,
  categories: string[],
  visibility: 'members' | 'secret' = 'members',
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
  createdAt: '2026-01-01T10:00:00.000Z',
});

async function importWorld(page: Page): Promise<string> {
  const category = (ref: string, name: string, color: string) => ({
    ref,
    name,
    icon: null,
    color,
    fieldsSchema: [],
    contentTemplate: null,
  });
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Atlante' },
    categories: [category('c1', 'Luoghi', 'teal'), category('c2', 'Rifugi', 'rust')],
    snippets: [
      snippet('s1', 'Porto Verde', ['c1']),
      snippet('s2', 'Foresta Nera', ['c1']),
      snippet('s3', 'Rocca', ['c2']),
      snippet('s4', 'Covo', ['c1'], 'secret'),
    ],
    relationTypes: [],
    relations: [],
  };
  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'atlante.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

async function uploadMap(
  page: Page,
  worldId: string,
  name: string,
  place = '',
  file = { name: 'mappa.png', mimeType: 'image/png', buffer: PNG },
) {
  await page.goto(`/worlds/${worldId}/maps`);
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByLabel('Immagine della mappa').setInputFiles(file);
  if (place) await page.getByLabel('Luogo', { exact: true }).selectOption({ label: place });
  await page.getByRole('button', { name: 'Carica la mappa' }).click();
}

async function addPin(page: Page, title: string, x: string, y: string, count: number) {
  await page.getByLabel('Luogo', { exact: true }).selectOption({ label: title });
  await page.getByLabel('Da sinistra (%)').fill(x);
  await page.getByLabel('Dall’alto (%)').fill(y);
  await page.getByRole('button', { name: 'Aggiungi il pin' }).click();
  await expect(page.getByRole('status')).toHaveText('Pin aggiunto.');
  // Lo stesso avviso compare a ogni pin: si aspetta la riga nuova, non il messaggio.
  await expect(page.locator('.data-table tbody tr')).toHaveCount(count);
}

const pinNames = (page: Page) => page.locator('.map-pins a.map-pin .map-pin-label').allInnerTexts();

test.describe.configure({ mode: 'serial' });

test.describe('mappe', () => {
  let owner: Page;
  let reader: Page;
  let worldId: string;
  let regionUrl: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240_000);
    owner = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(owner, 'Autrice');
    reader = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    const readerEmail = await registerAndSignIn(reader, 'Lettore');
    worldId = await importWorld(owner);
    await addMember(owner, worldId, readerEmail, 'reader');
  });

  test('carica una mappa, aggiunge pin (anche con un clic) e un percorso', async () => {
    await uploadMap(owner, worldId, 'Regione');
    await expect(owner.getByRole('status')).toHaveText('Mappa caricata.');
    await expect(owner.getByRole('heading', { level: 1, name: 'Regione' })).toBeVisible();
    regionUrl = new URL(owner.url()).pathname;
    await expect(owner.locator('img.map-image')).toBeVisible();
    // L'immagine è servita dalla rotta con la sessione (non è un file pubblico).
    const src = (await owner.locator('img.map-image').getAttribute('src')) as string;
    expect(src).toMatch(new RegExp(`^/worlds/${worldId}/images/[0-9a-f-]{36}\\.png$`));
    const res = await owner.request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');

    await addPin(owner, 'Porto Verde', '20', '30', 1);
    await addPin(owner, 'Foresta Nera', '60,5', '40', 2);
    await addPin(owner, 'Rocca', '80', '70', 3);
    await addPin(owner, 'Covo', '50', '50', 4);
    expect((await pinNames(owner)).sort()).toEqual([
      'Covo',
      'Foresta Nera',
      'Porto Verde',
      'Rocca',
    ]);
    await expect(owner.locator('.data-table tbody tr')).toHaveCount(4);
    await expect(owner.locator('.data-table tbody tr', { hasText: 'Foresta Nera' })).toContainText(
      '60.5% da sinistra, 40% dall’alto',
    );

    // Un clic sulla mappa (lontano dai pin) compila la posizione del nuovo pin.
    const box = (await owner.locator('.map-frame').boundingBox())!;
    await owner
      .locator('.map-frame')
      .click({ position: { x: box.width * 0.1, y: box.height * 0.9 } });
    const x = Number(await owner.locator('#pin-x').inputValue());
    const y = Number(await owner.locator('#pin-y').inputValue());
    expect(x).toBeGreaterThan(5);
    expect(x).toBeLessThan(15);
    expect(y).toBeGreaterThan(85);
    expect(y).toBeLessThan(95);

    // Un pin doppio, coordinate fuori scala e percorsi con una sola tappa sono rifiutati con un messaggio.
    await owner.getByLabel('Luogo', { exact: true }).selectOption({ label: 'Porto Verde' });
    await owner.getByLabel('Da sinistra (%)').fill('10');
    await owner.getByLabel('Dall’alto (%)').fill('10');
    await owner.getByRole('button', { name: 'Aggiungi il pin' }).click();
    await expect(owner.getByRole('alert').filter({ hasText: 'già un pin' })).toBeVisible();
    await owner.getByLabel('Luogo', { exact: true }).selectOption({ label: 'Rocca' });
    await owner.getByLabel('Da sinistra (%)').fill('150');
    await owner.getByLabel('Dall’alto (%)').fill('10');
    await owner.getByRole('button', { name: 'Aggiungi il pin' }).click();
    await expect(owner.getByRole('alert').filter({ hasText: 'tra 0 e 100' })).toBeVisible();

    await owner.getByLabel('Nome del percorso').fill('Viaggio');
    await owner.getByLabel('Tappa 1').selectOption({ label: 'Porto Verde' });
    await owner.getByRole('button', { name: 'Aggiungi il percorso' }).click();
    await expect(
      owner.getByRole('alert').filter({ hasText: 'Servono da 2 a 30 tappe' }),
    ).toBeVisible();

    await owner.getByLabel('Nome del percorso').fill('Viaggio');
    await owner.getByLabel('Tappa 1').selectOption({ label: 'Porto Verde' });
    await owner.getByLabel('Tappa 2').selectOption({ label: 'Foresta Nera' });
    await owner.getByLabel('Tappa 3').selectOption({ label: 'Rocca' });
    await owner.getByRole('button', { name: 'Aggiungi il percorso' }).click();
    await expect(owner.getByRole('status')).toHaveText('Percorso aggiunto.');
    await expect(owner.locator('.routes-list li')).toContainText(
      'Viaggio: Porto Verde → Foresta Nera → Rocca',
    );
    await expect(owner.locator('svg.map-routes polyline')).toHaveCount(1);
  });

  test('filtro per categoria e mappe annidate: il pin di un luogo apre la sua mappa', async () => {
    await owner.goto(regionUrl);
    await owner.getByLabel('Categoria').selectOption({ label: 'Rifugi' });
    await owner.getByRole('button', { name: 'Applica' }).click();
    await owner.waitForURL(/category=/);
    expect(await pinNames(owner)).toEqual(['Rocca']);
    await expect(owner.locator('svg.map-routes polyline')).toHaveCount(0);
    await owner.goto(regionUrl);

    await uploadMap(owner, worldId, 'Città portuale', 'Porto Verde');
    await expect(owner.getByRole('heading', { level: 1, name: 'Città portuale' })).toBeVisible();
    await expect(owner.getByText('Mappa del luogo:')).toContainText('Porto Verde');
    const cityUrl = new URL(owner.url()).pathname;

    await owner.goto(regionUrl);
    const pin = owner.locator('.map-pins a.map-pin', { hasText: 'Porto Verde' });
    await expect(pin).toHaveAttribute('href', cityUrl);
    await expect(pin).toHaveAttribute('aria-label', 'Porto Verde: apre la mappa «Città portuale»');
    // Da tastiera: il pin è un link.
    await pin.focus();
    await owner.keyboard.press('Enter');
    await expect(owner.getByRole('heading', { level: 1, name: 'Città portuale' })).toBeVisible();

    // La tabella alternativa dà anche il collegamento alla mappa del luogo.
    await owner.goto(regionUrl);
    await expect(
      owner.locator('.data-table tbody tr', { hasText: 'Porto Verde' }).getByRole('link', {
        name: 'Città portuale',
      }),
    ).toBeVisible();
  });

  test('validazione del caricamento: solo immagini vere, niente SVG', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await uploadMap(owner, worldId, 'Finta', '', {
      name: 'finta.png',
      mimeType: 'image/png',
      buffer: svg,
    });
    await expect(owner.locator('p[role="alert"]')).toContainText('Formato non supportato');
    await uploadMap(owner, worldId, 'Testo', '', {
      name: 'testo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('non sono un’immagine'),
    });
    await expect(owner.locator('p[role="alert"]')).toContainText('Formato non supportato');
    await owner.goto(`/worlds/${worldId}/maps`);
    await expect(owner.getByRole('link', { name: /Finta|Testo/ })).toHaveCount(0);
  });

  test('permessi: il lettore vede la mappa senza i luoghi segreti e non può modificarla', async () => {
    await reader.goto(regionUrl);
    expect((await pinNames(reader)).sort()).toEqual(['Foresta Nera', 'Porto Verde', 'Rocca']);
    expect(await reader.content()).not.toContain('Covo');
    await expect(reader.getByRole('button', { name: /Aggiungi|Elimina|Togli/ })).toHaveCount(0);
    await expect(reader.locator('.map-frame-pick')).toHaveCount(0);

    // Caricare comunque (chiamata diretta) non crea nulla.
    const before = await reader.request.get(`/worlds/${worldId}/maps`);
    expect(before.status()).toBe(200);
    await reader.request.post(`/worlds/${worldId}/maps/upload`, {
      multipart: { name: 'Intrusa', file: { name: 'a.png', mimeType: 'image/png', buffer: PNG } },
    });
    await reader.goto(`/worlds/${worldId}/maps`);
    await expect(reader.getByRole('link', { name: /Intrusa/ })).toHaveCount(0);
    await expect(reader.getByRole('link', { name: /Regione/ })).toBeVisible();
  });

  test('accessibilità, eliminazione con conferma e parametri ostili', async () => {
    await owner.goto(regionUrl);
    const serious = (await new AxeBuilder({ page: owner }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);

    const res = await owner.goto(`${regionUrl}?category=zz&error=<b>x</b>&notice=../..`);
    expect(res?.status()).toBe(200);
    expect((await owner.goto(`/worlds/${worldId}/maps/non-un-uuid`))?.status()).toBe(404);

    await owner.goto(regionUrl);
    await owner.getByRole('button', { name: 'Elimina la mappa' }).click();
    await expect(owner.locator('p[role="alert"]')).toContainText('Spunta la conferma');
    await owner.getByLabel(/Confermo/).check();
    await owner.getByRole('button', { name: 'Elimina la mappa' }).click();
    await expect(owner.getByRole('status')).toHaveText('Mappa eliminata.');
    await expect(owner.getByRole('link', { name: /Regione/ })).toHaveCount(0);
  });
});
