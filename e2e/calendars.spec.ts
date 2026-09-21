import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

/** Mondo con una categoria che ha un campo «data in calendario» e uno snippet. */
async function importWorld(page: Page): Promise<string> {
  const file = {
    format: 'worldloom.world',
    version: 1,
    world: { name: 'Calendari' },
    categories: [
      {
        ref: 'c1',
        name: 'Eventi',
        icon: null,
        color: 'teal',
        fieldsSchema: [{ key: 'quando', label: 'Quando', type: 'calendar_date' }],
        contentTemplate: null,
      },
    ],
    snippets: [
      {
        ref: 's1',
        title: 'Incoronazione',
        status: 'final',
        visibility: 'members',
        archived: false,
        tags: [],
        aliases: [],
        categories: ['c1'],
        fields: {},
        body: { type: 'doc', content: [{ type: 'paragraph' }] },
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    ],
    relationTypes: [],
    relations: [],
  };
  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'calendari.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

async function createCalendar(page: Page, worldId: string, name = 'Calendario di Aurelia') {
  await page.goto(`/worlds/${worldId}/calendars`);
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crea calendario' }) });
  await form.getByLabel('Nome', { exact: true }).fill(name);
  await form.getByLabel('Mesi', { exact: true }).fill('Alba, 20\nZenit, 20\nVespro, 20');
  await form
    .getByLabel('Giorni della settimana (facoltativi)')
    .fill('Uno, Due, Tre, Quattro, Cinque');
  await form.getByLabel('Ere (facoltative)').fill('Prima Era, -500\nSeconda Era, 100');
  await form.getByLabel('Ogni quanti anni').fill('3');
  await form.getByLabel('Numero del mese').fill('3');
  await form.getByLabel('Giorni in più').fill('2');
  await form.getByRole('button', { name: 'Crea calendario' }).click();
  await expect(page.getByRole('status')).toHaveText('Calendario creato.');
}

test.describe('calendari personalizzati', () => {
  test('creazione, modifica ed eliminazione di un calendario', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);
    await createCalendar(page, worldId);

    const item = page.getByRole('listitem').filter({ hasText: 'Calendario di Aurelia' });
    await expect(item).toContainText('3 mesi, 60 giorni all’anno');
    // Anno 2 (non lungo), 10 giorni dopo l'inizio: un esempio calcolato con il calendario.
    await expect(item).toContainText('Esempio: ');

    await item.getByText('Modifica', { exact: false }).first().click();
    await item.getByLabel('Nome', { exact: true }).fill('Calendario rinominato');
    await item.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Calendario salvato.');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Calendario rinominato' }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Elimina il calendario/ }).click();
    await expect(page.getByRole('status')).toContainText('Calendario eliminato.');
    await expect(page.getByText('Nessun calendario.')).toBeVisible();
  });

  test('errori chiari per definizioni non valide e nomi doppi', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);
    await page.goto(`/worlds/${worldId}/calendars`);
    const form = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Crea calendario' }) });
    await form.getByLabel('Nome', { exact: true }).fill('Storto');
    await form.getByLabel('Mesi', { exact: true }).fill('Alba, venti');
    await form.getByRole('button', { name: 'Crea calendario' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Mesi non validi' })).toBeVisible();

    await createCalendar(page, worldId, 'Solare');
    await page.goto(`/worlds/${worldId}/calendars`);
    await form.getByLabel('Nome', { exact: true }).fill('solare');
    await form.getByLabel('Mesi', { exact: true }).fill('Alba, 20');
    await form.getByRole('button', { name: 'Crea calendario' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Esiste già un calendario con questo nome.' }),
    ).toBeVisible();
  });

  test('campo data in calendario: salvataggio, rilettura e rifiuto di giorni inesistenti', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await importWorld(page);
    await createCalendar(page, worldId);

    await page.goto(`/worlds/${worldId}/snippets`);
    await page.getByRole('link', { name: 'Incoronazione' }).click();
    const date = page.getByRole('group', { name: 'Quando', exact: true });
    await date.getByLabel('Era').selectOption('Seconda Era');
    await date.getByLabel('Anno').fill('12');
    await date.getByLabel('Mese').selectOption({ label: 'Zenit' });
    await date.getByLabel('Giorno').fill('7');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.waitForURL(/notice=saved/);

    const saved = page.getByRole('group', { name: 'Quando', exact: true });
    await expect(saved.getByLabel('Era')).toHaveValue('Seconda Era');
    await expect(saved.getByLabel('Anno')).toHaveValue('12');
    await expect(saved.getByLabel('Mese')).toHaveValue('2');
    await expect(saved.getByLabel('Giorno')).toHaveValue('7');
    await expect(saved).toContainText('Data: 7 Zenit 12 Seconda Era');

    // Il 21 del mese non esiste (20 giorni): l'errore compare e il valore digitato non si perde.
    await saved.getByLabel('Giorno').fill('21');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Quando', exact: true })).toContainText(
      'Data non valida per questo calendario',
    );
    await expect(
      page.getByRole('group', { name: 'Quando', exact: true }).getByLabel('Giorno'),
    ).toHaveValue('21');

    // Svuotare i campi cancella la data.
    const again = page.getByRole('group', { name: 'Quando', exact: true });
    await again.getByLabel('Anno').fill('');
    await again.getByLabel('Mese').selectOption('');
    await again.getByLabel('Giorno').fill('');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.waitForURL(/notice=saved/);
    await expect(
      page.getByRole('group', { name: 'Quando', exact: true }).getByLabel('Anno'),
    ).toHaveValue('');
  });

  test('i lettori vedono i calendari ma non li modificano; accessibilità', async ({ browser }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const worldId = await importWorld(owner.page);
    await addMember(owner.page, worldId, reader.email, 'reader');
    await createCalendar(owner.page, worldId);

    await reader.page.goto(`/worlds/${worldId}/calendars`);
    await expect(
      reader.page.getByRole('heading', { level: 2, name: 'Calendario di Aurelia' }),
    ).toBeVisible();
    await expect(
      reader.page.getByRole('button', { name: /Crea calendario|Elimina il calendario/ }),
    ).toHaveCount(0);
    await expect(reader.page.getByText('Solo proprietari ed editor')).toBeVisible();

    await owner.page.goto(`/worlds/${worldId}/calendars`);
    const serious = (await new AxeBuilder({ page: owner.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
