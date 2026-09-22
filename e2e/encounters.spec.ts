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

async function createEncounter(page: Page, campaign: string, name: string): Promise<string> {
  await page.goto(`/campaigns/${campaign}/encounters`);
  await page.getByLabel('Nome (facoltativo)').fill(name);
  await page.getByRole('button', { name: 'Crea' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split('/')[4] as string;
}

async function addParticipant(
  page: Page,
  name: string,
  initiative: number,
  opts: { hpMax?: number; resourceLabel?: string } = {},
) {
  const form = page.locator('#add-participant-form');
  await form.getByLabel('Nome', { exact: true }).fill(name);
  await form.getByLabel('Iniziativa', { exact: true }).fill(String(initiative));
  if (opts.hpMax !== undefined) {
    await form.getByLabel('PF massimi').fill(String(opts.hpMax));
    await form.getByLabel('PF attuali').fill(String(opts.hpMax));
  }
  if (opts.resourceLabel) await form.getByLabel('Etichetta (facoltativa)').fill(opts.resourceLabel);
  await form.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Partecipante aggiunto.');
}

test.describe('tracker di iniziativa', () => {
  test('turni: i partecipanti si ordinano per iniziativa, il turno avanza e torna al primo dopo l’ultimo', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await createEncounter(dm, id, 'Imboscata');

    await addParticipant(dm, 'Goblin', 8);
    await addParticipant(dm, 'Eroe', 18);
    await addParticipant(dm, 'Orco', 12);

    const list = dm.locator('.encounter-list li');
    await expect(list).toHaveCount(3);
    // Ordine per iniziativa decrescente: Eroe (18), Orco (12), Goblin (8).
    await expect(list.nth(0)).toContainText('Eroe');
    await expect(list.nth(1)).toContainText('Orco');
    await expect(list.nth(2)).toContainText('Goblin');
    await expect(list.nth(0)).toContainText('Turno di:');

    // Ogni "Prossimo turno" ricarica la stessa pagina (stesso URL): si attende che il segno del turno lasci la riga
    // precedente prima di controllare quella nuova, altrimenti si rischia di leggere il DOM pre-navigazione.
    await dm.getByRole('button', { name: 'Prossimo turno' }).click();
    await expect(dm.locator('.encounter-list li').nth(0)).not.toContainText('Turno di:');
    await expect(dm.locator('.encounter-list li').nth(1)).toContainText('Turno di:');
    await expect(dm.getByText('Round 1')).toBeVisible();

    await dm.getByRole('button', { name: 'Prossimo turno' }).click();
    await expect(dm.locator('.encounter-list li').nth(1)).not.toContainText('Turno di:');
    await expect(dm.locator('.encounter-list li').nth(2)).toContainText('Turno di:');

    // Dopo l'ultimo si torna al primo e il round avanza.
    await dm.getByRole('button', { name: 'Prossimo turno' }).click();
    await expect(dm.locator('.encounter-list li').nth(2)).not.toContainText('Turno di:');
    await expect(dm.locator('.encounter-list li').nth(0)).toContainText('Turno di:');
    await expect(dm.getByText('Round 2')).toBeVisible();
  });

  test('condizioni e punti ferita: si registrano e si aggiornano', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await createEncounter(dm, id, 'Duello');
    await addParticipant(dm, 'Cavaliere', 15, { hpMax: 20, resourceLabel: 'PF' });

    const row = dm.locator('.encounter-list li').first();
    await expect(row).toContainText('PF: 20 / 20');

    await row.getByLabel('PF attuali').fill('12');
    await row.getByLabel('Condizioni').fill('Stordito, a terra');
    await row.getByRole('button', { name: 'Salva' }).click();
    await expect(dm.getByRole('status')).toHaveText('Partecipante aggiornato.');

    const updated = dm.locator('.encounter-list li').first();
    await expect(updated).toContainText('PF: 12 / 20');
    await expect(updated).toContainText('Stordito, a terra');
  });

  test('un giocatore vede lo scontro e segue il turno, ma non lo modifica', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const p1 = await newUser(browser, 'Giulia');
    const id = await createCampaign(dm, 'La Corona');
    await join(dm, p1, id, 'player');
    const encounterId = await createEncounter(dm, id, 'Agguato');
    await addParticipant(dm, 'Nemico', 10);

    await p1.goto(`/campaigns/${id}/encounters/${encounterId}`);
    await expect(p1.getByRole('heading', { level: 1, name: 'Agguato' })).toBeVisible();
    await expect(p1.locator('.encounter-list li')).toContainText('Nemico');
    await expect(p1.getByRole('button', { name: 'Prossimo turno' })).toHaveCount(0);
    await expect(p1.getByLabel('Iniziativa', { exact: true })).toHaveCount(0);
  });

  test('eliminare uno scontro richiede la conferma', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await createEncounter(dm, id, 'Da eliminare');

    await dm.getByRole('button', { name: 'Elimina' }).click();
    await expect(dm.locator('.message-error')).toHaveText(
      'Spunta la conferma per eliminare lo scontro.',
    );

    await dm.getByLabel('Confermo di voler eliminare questo scontro.').check();
    await dm.getByRole('button', { name: 'Elimina' }).click();
    await expect(dm.getByRole('status')).toHaveText('Scontro eliminato.');
    await expect(dm.getByText('Non c’è ancora nessuno scontro.')).toBeVisible();
  });

  test('accessibilità della pagina di uno scontro', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await createEncounter(dm, id, 'Scontro finale');
    await addParticipant(dm, 'Drago', 20, { hpMax: 100 });
    const results = await new AxeBuilder({ page: dm }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});
