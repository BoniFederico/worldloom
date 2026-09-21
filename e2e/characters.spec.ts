import AxeBuilder from '@axe-core/playwright';
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

/** Il DM invita con un link e chi lo riceve aderisce con il ruolo indicato. */
async function join(dm: Page, guest: Page, campaign: string, role: 'player' | 'observer') {
  await dm.goto(`/campaigns/${campaign}`);
  await dm.getByLabel('Ruolo', { exact: true }).selectOption(role);
  await dm.getByRole('button', { name: 'Crea invito' }).click();
  await expect(dm.getByRole('status')).toHaveText('Invito creato.');
  const link = await dm.locator('input.invite-link').first().inputValue();
  await guest.goto(link);
  await guest.getByRole('button', { name: 'Accetta l’invito' }).click();
  await expect(guest.getByRole('status')).toHaveText('Sei entrato nella campagna.');
}

async function useD20(dm: Page, campaign: string) {
  await dm.goto(`/campaigns/${campaign}/stats`);
  await dm.getByRole('button', { name: 'Usa lo schema «Fantasy d20»' }).click();
  await expect(dm.getByRole('status')).toHaveText('Schema sostituito.');
}

async function createSheet(page: Page, campaign: string, name: string, kind?: 'pc' | 'npc') {
  await page.goto(`/campaigns/${campaign}/characters`);
  await page.getByLabel('Nome', { exact: true }).fill(name);
  if (kind) await page.getByLabel('Tipo').selectOption(kind);
  await page.getByRole('button', { name: 'Crea la scheda' }).click();
  await expect(page.getByRole('status')).toHaveText('Scheda creata.');
  return new URL(page.url()).pathname.split('/')[4] as string;
}

const attr = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** Apre l'editor dello schema e aspetta che React sia attivo (il campo è controllato: un testo scritto prima verrebbe sovrascritto). */
async function openStats(page: Page, campaign: string, query = '') {
  await page.goto(`/campaigns/${campaign}/stats${query}`);
  await page.waitForFunction(() => {
    const el = document.querySelector('#stats-schema');
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
  });
  return page.getByLabel('Schema (JSON)');
}

test.describe('schema di statistiche', () => {
  test('errori con riga e campo, salvataggio, preset e ripristino', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await dm.goto(`/campaigns/${id}/characters`);
    await expect(
      dm.getByText('Il DM deve prima definire lo schema di statistiche della campagna.'),
    ).toBeVisible();
    await expect(dm.getByLabel('Nome', { exact: true })).toHaveCount(0);

    const editor = await openStats(dm, id);

    // JSON non valido: riga e colonna.
    await editor.fill('{\n  "schemaVersion": 1,\n  "name": "X",\n}');
    await dm.getByRole('button', { name: 'Verifica' }).click();
    await expect(dm.locator('.message-error')).toContainText('Riga 4, colonna 1');
    await expect(dm.locator('.message-error')).toContainText('JSON non valido');
    // Il testo digitato non si perde.
    await expect(editor).toHaveValue(/"name": "X"/);

    // Formula con un errore: riga del campo e nome della causa.
    const bad = {
      schemaVersion: 1,
      name: 'Prova',
      attributes: [{ key: 'str', label: 'Forza', type: 'integer', default: 10 }],
      derived: [{ key: 'mod', label: 'Modificatore', formula: 'floor(str / )' }],
    };
    await editor.fill(JSON.stringify(bad, null, 2));
    await dm.getByRole('button', { name: 'Salva lo schema' }).click();
    await expect(dm.locator('.message-error')).toContainText('Riga 16');
    await expect(dm.locator('.message-error')).toContainText('Formula non valida');

    // Campo sconosciuto (punta alla chiave) e, corretto quello, riferimento sconosciuto.
    await editor.fill(JSON.stringify({ ...bad, colore: 1 }, null, 2));
    await dm.getByRole('button', { name: 'Verifica' }).click();
    await expect(dm.locator('.message-error')).toContainText('Campo sconosciuto: «colore»');
    await editor.fill(
      JSON.stringify(
        { ...bad, derived: [{ key: 'mod', label: 'M', formula: 'str + dex' }] },
        null,
        2,
      ),
    );
    await dm.getByRole('button', { name: 'Verifica' }).click();
    await expect(dm.locator('.message-error')).toContainText('«dex», che non è un attributo');

    // Schema valido: verifica e salvataggio, poi l'anteprima.
    const good = {
      ...bad,
      derived: [{ key: 'mod', label: 'Modificatore', formula: 'floor((str - 10) / 2)' }],
    };
    await editor.fill(JSON.stringify(good, null, 2));
    await dm.getByRole('button', { name: 'Verifica' }).click();
    await expect(dm.getByRole('status')).toHaveText('Lo schema è valido.');
    await dm.getByRole('button', { name: 'Salva lo schema' }).click();
    await expect(dm.getByRole('status')).toHaveText('Schema salvato.');
    await dm.reload();
    await expect(dm.getByRole('heading', { name: 'Anteprima live' })).toBeVisible();
    await expect(attr(dm, 'Forza')).toBeDisabled();
    await expect(dm.getByRole('term').filter({ hasText: 'Modificatore' })).toBeVisible();

    // Preset e ripristino del predefinito (senza schede non c'è nulla da migrare).
    await dm.getByRole('button', { name: 'Usa lo schema «Pool di dadi»' }).click();
    await expect(dm.getByRole('status')).toHaveText('Schema sostituito.');
    await expect(attr(dm, 'Corpo')).toBeVisible();
    await dm.getByRole('button', { name: 'Ripristina lo schema predefinito' }).click();
    await expect(dm.getByRole('status')).toHaveText('Schema predefinito ripristinato.');
    await expect(attr(dm, 'Costituzione')).toBeVisible();
  });

  test('solo il DM modifica lo schema; un giocatore vede l’anteprima', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const player = await newUser(browser, 'Giocatore');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    await join(dm, player, id, 'player');
    await player.goto(`/campaigns/${id}/stats`);
    await expect(player.getByText('Solo il DM modifica lo schema.')).toBeVisible();
    await expect(player.getByLabel('Schema (JSON)')).toHaveCount(0);
    await expect(attr(player, 'Forza')).toBeDisabled();
  });
});

test.describe('schede personaggio', () => {
  test('il DM compila una scheda: valori calcolati, liste, note, cronologia e limiti', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    const sheetId = await createSheet(dm, id, 'Arathorn', 'npc');

    await expect(dm.getByRole('heading', { level: 1, name: 'Arathorn' })).toBeVisible();
    // Predefiniti: 10 in tutto, mod. 0, PF al massimo (10).
    await expect(attr(dm, 'Forza')).toHaveValue('10');
    await expect(dm.getByRole('term').filter({ hasText: 'Mod. Forza' })).toBeVisible();

    await attr(dm, 'Livello').fill('5');
    await attr(dm, 'Forza').fill('17');
    await attr(dm, 'Costituzione').fill('14');
    await dm.getByLabel('Inventario, riga 1, name').fill('Spada lunga');
    await dm.getByLabel('Inventario, riga 1, qty').fill('1');
    await dm.getByLabel('Inventario, riga 1, weight').fill('1.5');
    await dm.getByLabel('Background').fill('Ramingo del Nord.');
    await dm.getByLabel('Note', { exact: true }).fill('Conosce il passo.');
    await dm.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(dm.getByRole('status')).toHaveText('Scheda salvata.');

    // Valori calcolati dopo il salvataggio: Forza 17 → +3, Cost. 14 → +2, livello 5 → competenza +3.
    await expect(dm.getByRole('definition').filter({ hasText: /^3$/ }).first()).toBeVisible();
    await expect(dm.getByText('massimo 44')).toBeVisible();
    // I valori restano dopo il ricaricamento, comprese la lista e le note.
    await dm.goto(`/campaigns/${id}/characters/${sheetId}`);
    await expect(attr(dm, 'Forza')).toHaveValue('17');
    await expect(dm.getByLabel('Inventario, riga 1, name')).toHaveValue('Spada lunga');
    await expect(dm.getByLabel('Inventario, riga 1, weight')).toHaveValue('1.5');
    await expect(dm.getByLabel('Background')).toHaveValue('Ramingo del Nord.');
    await expect(dm.getByLabel('Note', { exact: true })).toHaveValue('Conosce il passo.');

    // Cronologia: chi e che cosa, con prima e dopo dei numeri.
    const history = dm.locator('.visibility-log');
    await expect(history).toContainText('Direttrice ha creato la scheda «Arathorn».');
    await expect(history).toContainText('Direttrice ha modificato:');
    await expect(history).toContainText('Forza: 10 → 17');
    await expect(history).toContainText('Costituzione: 10 → 14');
    await expect(history).toContainText('Inventario (modificato)');
    await expect(history).toContainText('note');

    // Limiti: fuori intervallo, non numerico, risorsa oltre il massimo.
    // Il browser blocca già i valori fuori intervallo: si toglie il limite dal campo per provare il controllo del server.
    await attr(dm, 'Forza').evaluate((el) => el.removeAttribute('max'));
    await attr(dm, 'Forza').fill('99');
    await dm.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(dm.locator('.message-error')).toHaveText('«Forza» è fuori dai limiti consentiti.');
    await expect(attr(dm, 'Forza')).toHaveValue('17');
    await attr(dm, 'Punti ferita').evaluate((el) => el.removeAttribute('max'));
    await attr(dm, 'Punti ferita').fill('45');
    await dm.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(dm.locator('.message-error')).toHaveText(
      '«Punti ferita» è fuori dai limiti consentiti.',
    );

    // Svuotare le celle di una riga la toglie.
    await dm.getByLabel('Inventario, riga 1, name').fill('');
    await dm.getByLabel('Inventario, riga 1, qty').fill('');
    await dm.getByLabel('Inventario, riga 1, weight').fill('');
    await dm.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(dm.getByRole('status')).toHaveText('Scheda salvata.');
    await expect(dm.getByLabel('Inventario, riga 1, name')).toHaveValue('');
  });

  test('due schede aperte insieme: la seconda modifica dà un conflitto e non sovrascrive', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    const sheetId = await createSheet(dm, id, 'Doppia', 'npc');
    const other = await dm.context().newPage();
    await other.goto(`/campaigns/${id}/characters/${sheetId}`);
    await attr(other, 'Forza').fill('12');
    await attr(dm, 'Forza').fill('15');
    await dm.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(dm.getByRole('status')).toHaveText('Scheda salvata.');
    await other.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(other.locator('.message-error')).toContainText(
      'Qualcun altro ha salvato la scheda prima di te',
    );
    await dm.goto(`/campaigns/${id}/characters/${sheetId}`);
    await expect(attr(dm, 'Forza')).toHaveValue('15');
  });

  test('un giocatore vede e scrive solo le proprie schede; il DM le vede tutte', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const p1 = await newUser(browser, 'Giulia');
    const p2 = await newUser(browser, 'Marco');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    await join(dm, p1, id, 'player');
    await join(dm, p2, id, 'player');
    const npc = await createSheet(dm, id, 'Oste Baldo', 'npc');

    // Il giocatore crea solo un PG per sé (nessuna scelta di tipo o proprietario).
    await p1.goto(`/campaigns/${id}/characters`);
    await expect(p1.getByText('Crei un personaggio per te.')).toBeVisible();
    await expect(p1.getByLabel('Tipo')).toHaveCount(0);
    await expect(p1.getByLabel('Giocatore', { exact: true })).toHaveCount(0);
    await p1.getByLabel('Nome', { exact: true }).fill('Lyra');
    await p1.getByRole('button', { name: 'Crea la scheda' }).click();
    await expect(p1.getByRole('status')).toHaveText('Scheda creata.');
    const mine = new URL(p1.url()).pathname.split('/')[4] as string;
    await expect(p1.getByLabel('Tipo')).toHaveCount(0);
    await attr(p1, 'Destrezza').fill('16');
    await p1.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(p1.getByRole('status')).toHaveText('Scheda salvata.');
    await expect(p1.locator('.visibility-log')).toContainText('Giulia ha modificato:');

    // Elenco: solo la propria. Il PNG del DM e la scheda altrui non esistono per lei.
    await p1.goto(`/campaigns/${id}/characters`);
    await expect(p1.getByRole('link', { name: 'Lyra' })).toBeVisible();
    await expect(p1.getByRole('link', { name: 'Oste Baldo' })).toHaveCount(0);
    expect((await p1.goto(`/campaigns/${id}/characters/${npc}`))?.status()).toBe(404);
    expect((await p2.goto(`/campaigns/${id}/characters/${mine}`))?.status()).toBe(404);
    await p2.goto(`/campaigns/${id}/characters`);
    await expect(p2.getByRole('link', { name: 'Lyra' })).toHaveCount(0);

    // Il DM vede tutto e in cronologia c'è il nome di chi ha modificato.
    await dm.goto(`/campaigns/${id}/characters`);
    await expect(dm.getByRole('link', { name: 'Lyra' })).toBeVisible();
    await expect(dm.getByRole('link', { name: 'Oste Baldo' })).toBeVisible();
    await expect(dm.getByRole('row', { name: /Lyra.*PG.*Giulia/ })).toBeVisible();
    await dm.getByRole('link', { name: 'Lyra' }).click();
    await expect(dm.locator('.visibility-log')).toContainText('Giulia ha modificato:');
    await expect(dm.locator('.visibility-log')).toContainText('Destrezza: 10 → 16');

    // Il DM assegna la scheda a un altro giocatore: la prima non la vede più.
    await dm.getByLabel('Giocatore', { exact: true }).selectOption({ label: 'Marco' });
    await dm.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(dm.getByRole('status')).toHaveText('Scheda salvata.');
    expect((await p1.goto(`/campaigns/${id}/characters/${mine}`))?.status()).toBe(404);
    await p2.goto(`/campaigns/${id}/characters/${mine}`);
    await expect(p2.getByRole('heading', { level: 1, name: 'Lyra' })).toBeVisible();

    // Il proprietario può eliminare la propria scheda, ma serve la conferma.
    await p2.getByRole('button', { name: 'Elimina', exact: true }).click();
    await expect(p2.locator('.message-error')).toHaveText('Conferma l’eliminazione per procedere.');
    await p2.getByLabel('Confermo l’eliminazione della scheda e della sua cronologia').check();
    await p2.getByRole('button', { name: 'Elimina', exact: true }).click();
    await expect(p2.getByRole('status')).toHaveText('Scheda eliminata.');
  });

  test('un osservatore non vede né crea schede', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const obs = await newUser(browser, 'Osservatore');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    await join(dm, obs, id, 'observer');
    const sheet = await createSheet(dm, id, 'Segreta', 'npc');
    await obs.goto(`/campaigns/${id}/characters`);
    await expect(obs.getByRole('link', { name: 'Segreta' })).toHaveCount(0);
    await expect(obs.getByLabel('Nome', { exact: true })).toHaveCount(0);
    expect((await obs.goto(`/campaigns/${id}/characters/${sheet}`))?.status()).toBe(404);
  });

  test('un estraneo non trova né lo schema né le schede', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const stranger = await newUser(browser, 'Estraneo');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    const sheet = await createSheet(dm, id, 'Privata', 'npc');
    expect((await stranger.goto(`/campaigns/${id}/stats`))?.status()).toBe(404);
    expect((await stranger.goto(`/campaigns/${id}/characters`))?.status()).toBe(404);
    expect((await stranger.goto(`/campaigns/${id}/characters/${sheet}`))?.status()).toBe(404);
  });

  test('accessibilità di elenco, scheda e schema', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    const sheet = await createSheet(dm, id, 'Arathorn', 'npc');
    for (const path of [
      `/campaigns/${id}/stats`,
      `/campaigns/${id}/characters`,
      `/campaigns/${id}/characters/${sheet}`,
    ]) {
      await dm.goto(path);
      const results = await new AxeBuilder({ page: dm }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious.map((v) => `${path}: ${v.id}`)).toEqual([]);
    }
  });
});
