import { expect, test, type Browser, type Page } from '@playwright/test';
import { registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  await registerAndSignIn(page, name);
  return page;
}

async function createCampaign(page: Page, name: string): Promise<string> {
  await page.goto('/campaigns');
  await page.getByLabel('Nome della campagna').fill(name);
  await page.getByRole('button', { name: 'Crea campagna' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split('/')[2] as string;
}

async function useD20(dm: Page, campaign: string) {
  await dm.goto(`/campaigns/${campaign}/stats`);
  await dm.getByRole('button', { name: 'Usa lo schema «Fantasy d20»' }).click();
  await expect(dm.getByRole('status')).toHaveText('Schema sostituito.');
}

async function createSheet(page: Page, campaign: string, name: string) {
  await page.goto(`/campaigns/${campaign}/characters`);
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByLabel('Tipo').selectOption('npc');
  await page.getByRole('button', { name: 'Crea la scheda' }).click();
  await expect(page.getByRole('status')).toHaveText('Scheda creata.');
  return new URL(page.url()).pathname.split('/')[4] as string;
}

const attr = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** Apre l'editor dello schema e aspetta che React sia attivo: il campo è controllato e un testo scritto prima verrebbe sovrascritto. */
async function openStats(page: Page, campaign: string, query = '') {
  await page.goto(`/campaigns/${campaign}/stats${query}`);
  await page.waitForFunction(() => {
    const el = document.querySelector('#stats-schema');
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
  });
  return page.getByLabel('Schema (JSON)');
}

const schemaWith = (over: Record<string, unknown>) =>
  JSON.stringify(
    {
      schemaVersion: 1,
      name: 'Live',
      attributes: [
        { key: 'vigore', label: 'Vigore', type: 'integer', min: 1, max: 20, default: 7 },
      ],
      ...over,
    },
    null,
    2,
  );

test.describe('anteprima live e migrazione guidata', () => {
  test('la scheda e gli errori si aggiornano mentre si scrive, senza salvare', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    const editor = await openStats(dm, id);
    // Prima di salvare, l'anteprima mostra già lo schema di partenza.
    await expect(attr(dm, 'Forza')).toBeDisabled();

    await editor.fill(schemaWith({}));
    await expect(attr(dm, 'Vigore')).toHaveValue('7');
    await expect(attr(dm, 'Forza')).toHaveCount(0);
    await expect(dm.locator('.message-error')).toHaveCount(0);

    // Un errore compare subito; l'anteprima lascia il posto al suggerimento.
    await editor.fill(schemaWith({ derived: [{ key: 'x', label: 'X', formula: 'vigore +' }] }));
    await expect(dm.locator('.message-error')).toContainText('Formula non valida');
    await expect(
      dm.getByText('Correggi gli errori dello schema per vedere l’anteprima.'),
    ).toBeVisible();

    // Tornando valido riappare, con i valori calcolati; nulla è stato salvato.
    await editor.fill(
      schemaWith({ derived: [{ key: 'x', label: 'Doppio', formula: 'vigore * 2' }] }),
    );
    await expect(dm.getByRole('term').filter({ hasText: 'Doppio' })).toBeVisible();
    await expect(dm.getByRole('definition').filter({ hasText: /^14$/ })).toBeVisible();
    await dm.reload();
    await expect(attr(dm, 'Vigore')).toHaveCount(0);
    await expect(attr(dm, 'Forza')).toBeDisabled();
  });

  test('un campo tolto: i valori si spostano su una chiave nuova o si eliminano, per tutte le schede', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    const a = await createSheet(dm, id, 'Arathorn');
    await attr(dm, 'Saggezza').fill('15');
    await dm.getByLabel('Background').fill('Ramingo.');
    await dm.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(dm.getByRole('status')).toHaveText('Scheda salvata.');
    await createSheet(dm, id, 'Baldo');

    // Nuovo schema: «Saggezza» cambia chiave (wis → sag), il testo «Background» sparisce.
    const editor = await openStats(dm, id);
    const current = JSON.parse(await editor.inputValue()) as {
      attributes: { key: string; label: string }[];
      text: { key: string }[];
      layout: { fields: string[] }[];
    };
    current.attributes = current.attributes.map((x) =>
      x.key === 'wis' ? { ...x, key: 'sag' } : x,
    );
    current.text = current.text.filter((x) => x.key !== 'background');
    current.layout = current.layout.map((s) => ({
      ...s,
      fields: s.fields.map((f) => (f === 'wis' ? 'sag' : f)).filter((f) => f !== 'background'),
    }));
    const next = JSON.stringify(current, null, 2);
    await editor.fill(next);
    await dm.getByRole('button', { name: 'Salva lo schema' }).click();

    // Non si salva ancora: compare la migrazione guidata, con la destinazione proposta.
    await expect(
      dm.getByRole('heading', { name: 'Migrazione delle schede esistenti' }),
    ).toBeVisible();
    await expect(dm.getByLabel('Campo «Saggezza»: 2 schede hanno un valore')).toHaveValue('sag');
    await expect(dm.getByLabel('Campo «Background»: 1 scheda ha un valore')).toHaveValue('');
    // Finché non si applica, schema e schede restano come sono.
    await dm.goto(`/campaigns/${id}/characters/${a}`);
    await expect(attr(dm, 'Saggezza')).toHaveValue('15');
    await expect(dm.getByLabel('Background')).toHaveValue('Ramingo.');

    // Si rifà il cambio e si applica.
    const again = await openStats(dm, id);
    await again.fill(next);
    await dm.getByRole('button', { name: 'Salva lo schema' }).click();
    await expect(dm.getByLabel('Campo «Saggezza»: 2 schede hanno un valore')).toHaveValue('sag');
    await dm.getByRole('button', { name: 'Applica la migrazione' }).click();
    await expect(dm.getByRole('status')).toHaveText('Schema salvato e 2 schede aggiornate.');

    // Il valore ha cambiato chiave, il testo eliminato non c'è più; la cronologia lo racconta (una chiave tolta si mostra con il suo nome tecnico).
    await dm.goto(`/campaigns/${id}/characters/${a}`);
    await expect(attr(dm, 'Saggezza')).toHaveValue('15');
    await expect(dm.getByLabel('Background')).toHaveCount(0);
    const history = dm.locator('.visibility-log');
    await expect(history).toContainText('Direttrice ha modificato:');
    await expect(history).toContainText('wis: 15 → —');
    await expect(history).toContainText('Saggezza: — → 15');
  });

  test('un preset che tocca le schede esistenti apre l’editor invece di applicarsi', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    const a = await createSheet(dm, id, 'Arathorn');

    await dm.goto(`/campaigns/${id}/stats`);
    await dm.getByRole('button', { name: 'Usa lo schema «Pool di dadi»' }).click();
    await expect(dm.getByRole('status')).toContainText('Questo schema tocca le schede esistenti');
    // Il preset è nell'editor ma non è stato salvato: la scheda ha ancora i campi del d20.
    await expect(dm.getByLabel('Schema (JSON)')).toHaveValue(/Pool di dadi/);
    await dm.goto(`/campaigns/${id}/characters/${a}`);
    await expect(attr(dm, 'Forza')).toHaveValue('10');

    // Salvare porta alla migrazione: i valori del d20 si eliminano e la scheda prende i campi nuovi.
    const editor = await openStats(dm, id, '?draft=dice-pool');
    await expect(editor).toHaveValue(/Pool di dadi/);
    await dm.getByRole('button', { name: 'Salva lo schema' }).click();
    await expect(
      dm.getByRole('heading', { name: 'Migrazione delle schede esistenti' }),
    ).toBeVisible();
    await dm.getByRole('button', { name: 'Applica la migrazione' }).click();
    await expect(dm.getByRole('status')).toContainText('Schema salvato e 1 scheda aggiornata.');
    await dm.goto(`/campaigns/${id}/characters/${a}`);
    await expect(attr(dm, 'Corpo')).toHaveValue('2');
    await expect(attr(dm, 'Forza')).toHaveCount(0);
  });

  test('senza schede il cambio di schema si salva subito', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    const editor = await openStats(dm, id);
    await editor.fill(schemaWith({}));
    await dm.getByRole('button', { name: 'Salva lo schema' }).click();
    await expect(dm.getByRole('status')).toHaveText('Schema salvato.');
    await expect(
      dm.getByRole('heading', { name: 'Migrazione delle schede esistenti' }),
    ).toHaveCount(0);
  });
});
